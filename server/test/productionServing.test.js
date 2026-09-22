import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createApp } from '../src/app.js'

function contextFor(clientDistPath) {
  const notUsed = () => { throw new Error('Unexpected service call') }
  return {
    config: { serveClient: true, clientDistPath },
    logger: { error() {} },
    repository: {
      getPaperFacets: notUsed,
      listRecentPapers: notUsed,
      listPapers: notUsed,
      getPaper: notUsed,
      getPaperContext: notUsed,
      globalSearch: notUsed
    },
    searchService: { search: notUsed, confirm: notUsed },
    importService: { list: notUsed, create: notUsed, get: notUsed, retry: notUsed },
    paperCrudService: { create: notUsed, update: notUsed, delete: notUsed }
  }
}

test('production server serves static assets and SPA routes without hiding API 404s', async (t) => {
  const clientDistPath = fs.mkdtempSync(path.join(os.tmpdir(), 'paperpulse-client-'))
  fs.mkdirSync(path.join(clientDistPath, 'assets'))
  fs.writeFileSync(path.join(clientDistPath, 'index.html'), '<!doctype html><title>PaperPulse production</title>')
  fs.writeFileSync(path.join(clientDistPath, 'assets', 'app.js'), 'globalThis.PaperPulse = true')
  t.after(() => fs.rmSync(clientDistPath, { recursive: true, force: true }))

  const server = createApp(contextFor(clientDistPath)).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}`

  const page = await fetch(`${base}/papers/P-000001`)
  assert.equal(page.status, 200)
  assert.match(await page.text(), /PaperPulse production/)

  const asset = await fetch(`${base}/assets/app.js`)
  assert.equal(asset.status, 200)
  assert.match(await asset.text(), /PaperPulse/)

  const apiMissing = await fetch(`${base}/api/not-a-route`)
  assert.equal(apiMissing.status, 404)
  assert.equal((await apiMissing.json()).error.code, 'not_found')

  const fileMissing = await fetch(`${base}/missing.js`)
  assert.equal(fileMissing.status, 404)
})

test('production serving fails fast when the client bundle is missing', () => {
  assert.throws(
    () => createApp(contextFor(path.join(os.tmpdir(), 'paperpulse-does-not-exist'))),
    /Production client bundle not found/
  )
})
