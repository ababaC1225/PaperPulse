from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "docs" / "assets"
FRAME_DIR = ROOT / ".tmp-trend-gif"
GIF_PATH = OUTPUT_DIR / "trend-analysis-demo.gif"
PREVIEW_PATH = FRAME_DIR / "trend-analysis-preview.png"

VIEWPORT = {"width": 1440, "height": 960}


def prepare_dirs():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    FRAME_DIR.mkdir(parents=True, exist_ok=True)
    for frame in FRAME_DIR.glob("frame-*.png"):
        frame.unlink()


def capture_frame(target, index):
    path = FRAME_DIR / f"frame-{index:03d}.png"
    target.screenshot(path=str(path), animations="allow")
    return path


def build_gif(frame_paths, durations):
    frames = []
    for path in frame_paths:
        image = Image.open(path).convert("RGB")
        image.thumbnail((960, 681), Image.Resampling.LANCZOS)
        frames.append(image.quantize(colors=192, method=Image.Quantize.MEDIANCUT))

    frames[0].save(
        GIF_PATH,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=2,
    )


def main():
    prepare_dirs()
    frame_paths = []
    durations = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport=VIEWPORT, device_scale_factor=1)
        page.goto("http://127.0.0.1:5173/trend-analysis", wait_until="networkidle")
        page.wait_for_selector(".trend-chart svg")
        page.screenshot(path=str(PREVIEW_PATH), full_page=True)
        demo = page.locator(".trend-layout")
        demo.scroll_into_view_if_needed()
        page.locator(".playback-speed button").nth(2).click()

        frame_paths.append(capture_frame(demo, len(frame_paths)))
        durations.append(800)

        page.get_by_role("button", name="Play", exact=True).click()
        for _ in range(3):
            page.wait_for_timeout(180)
            frame_paths.append(capture_frame(demo, len(frame_paths)))
            durations.append(180)

        page.get_by_role("button", name="Pause", exact=True).click()
        frame_paths.append(capture_frame(demo, len(frame_paths)))
        durations.append(700)

        page.get_by_role("button", name="Play", exact=True).click()
        for _ in range(9):
            page.wait_for_timeout(180)
            frame_paths.append(capture_frame(demo, len(frame_paths)))
            durations.append(180)

        frame_paths.append(capture_frame(demo, len(frame_paths)))
        durations.append(700)

        page.get_by_role("button", name="Replay", exact=True).click()
        for _ in range(10):
            page.wait_for_timeout(180)
            frame_paths.append(capture_frame(demo, len(frame_paths)))
            durations.append(180)

        frame_paths.append(capture_frame(demo, len(frame_paths)))
        durations.append(1100)
        browser.close()

    build_gif(frame_paths, durations)
    with Image.open(GIF_PATH) as result:
        print(f"saved {GIF_PATH}")
        print(f"frames={getattr(result, 'n_frames', 1)} size={result.size} bytes={GIF_PATH.stat().st_size}")
    print(f"preview {PREVIEW_PATH}")


if __name__ == "__main__":
    main()
