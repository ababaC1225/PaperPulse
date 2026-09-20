import sys
from playwright.sync_api import sync_playwright

targets = [
    ("http://localhost:5173/", "shot_overview.png"),
    ("http://localhost:5173/hot-topics", "shot_hot_topics.png"),
]

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    for url, name in targets:
        page.goto(url, wait_until="networkidle")
        page.wait_for_timeout(1500)
        page.screenshot(path=name, full_page=True)
        print(f"saved {name}")
    browser.close()
