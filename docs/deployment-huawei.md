# Huawei Cloud single-server deployment

This deployment runs the built Vue application and Express API from one Node.js
container. SQLite is stored in the named `paperpulse-data` volume rather than in
the image or Git repository. The layout is intended for one Huawei ECS instance;
the in-process import worker is not safe to run concurrently on multiple replicas.

## Prerequisites

- A Linux Huawei ECS instance with a persistent system disk or attached EVS disk.
- Docker Engine with the Compose plugin.
- Inbound access to the chosen application port for initial verification.
- Outbound HTTPS access to CVF Open Access, ECVA and DBLP for remote imports.

For a public final deployment, terminate HTTPS through a domain-backed reverse
proxy or load balancer and expose only ports 80/443. Do not expose the SQLite
volume, environment files or Docker socket.

## Build and start

Clone the repository on the ECS instance, then run from its root:

```bash
export PAPERPULSE_USER_AGENT='PaperPulseCourseProject/1.0 (+https://your-project-url.example; educational metadata client)'
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3000/api/health
```

The server creates `/data/paperpulse.db` and applies all migrations at startup.
The named volume survives container replacement and image upgrades. Confirm it
exists before importing:

```bash
docker volume inspect paperpulse-data
```

## Import the demonstration sample on the cloud

Do not copy the ignored local development database through Git. Build the same
120-paper sample directly on ECS:

```bash
docker compose exec paperpulse node server/src/cli.js demo-import 20
docker compose exec paperpulse node server/src/cli.js extract-keywords
```

The import is deliberately rate limited. Keep the container running until the
command finishes. Repeating `demo-import 20` must report duplicates rather than
create additional papers. Validate the six 20-paper cohorts and all analysis
pages using the checks in [`demo-dataset.md`](demo-dataset.md).

## Upgrade without losing data

```bash
git pull --ff-only
docker compose up -d --build
curl --fail http://127.0.0.1:3000/api/health
```

Never run `docker compose down -v`: the `-v` option deletes the named database
volume. Normal `docker compose down` and container replacement preserve it.

## Backup and restore

Stop the application briefly so the SQLite database and WAL state are closed:

```bash
mkdir -p backups
docker compose stop paperpulse
docker run --rm \
  -v paperpulse-data:/source:ro \
  -v "$PWD/backups:/backup" \
  alpine:3.20 sh -c 'cp -a /source/. /backup/'
docker compose start paperpulse
```

Copy the resulting backup directory to encrypted Huawei OBS storage according to
the account's retention policy. Test restoration before relying on a backup.

To restore, stop the service, copy the complete saved directory back into the
`paperpulse-data` volume, and start the service. Keep the application version and
database migration version recorded with each backup.

## Smoke-test checklist

1. `/api/health` returns HTTP 200.
2. Refreshing a client-side route such as `/papers/<id>` returns the Vue app.
3. Unknown `/api/...` routes return JSON 404 responses, not `index.html`.
4. Overview reports 120 papers after the demo import.
5. CVPR 2023/2024, ICCV 2021/2023 and ECCV 2022/2024 each contain 20 papers.
6. Hot Topics, Keyword Map and Trend Analysis return populated results.
7. Paper Detail shows the official URL and keyword provenance.
8. A repeated import creates no duplicates.
9. Rebuilding the container leaves the paper count unchanged.
10. A backup exists outside the ECS instance.
