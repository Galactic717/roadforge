"""Exercise the actual browser workflow against an isolated local server."""

from __future__ import annotations

import sys
import threading
from http.server import ThreadingHTTPServer
from types import SimpleNamespace

from playwright.sync_api import sync_playwright

from roadforge import server
from roadforge.mission import _router


def test_editor_training_and_mission(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "DATA", tmp_path)
    monkeypatch.setattr(server, "WORLD_FILE", tmp_path / "world.json")
    monkeypatch.setattr(server, "MODEL_FILE", tmp_path / "model.json")
    monkeypatch.setattr(server, "MODEL_META", tmp_path / "model_meta.json")
    server.Handler.app = server.App()
    http = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    thread = threading.Thread(target=http.serve_forever, daemon=True)
    thread.start()
    errors = []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 950})
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(f"http://127.0.0.1:{http.server_port}")
            page.locator("#engine-state").get_by_text("ENGINE ONLINE").wait_for()

            page.locator("#preset-select").select_option("switchback")
            page.locator("#preset-btn").click()
            page.locator("#map-title").get_by_text("Switchback").wait_for()
            assert page.locator('#driver-mode option[value="learned"]').is_disabled()

            page.locator("#epochs").fill("8")
            page.locator("#samples").fill("300")
            page.locator("#train-btn").click()
            page.wait_for_function(
                "document.querySelector('#train-status').textContent.includes('Complete')", timeout=30000
            )
            assert not page.locator('#driver-mode option[value="learned"]').is_disabled()

            before = len(server.Handler.app.world.roads)
            page.locator('[data-tool="draw"]').click()
            rect = page.locator("#world-canvas").bounding_box()

            def click_world(x, y):
                page.mouse.click(rect["x"] + x / 1040 * rect["width"], rect["y"] + y / 800 * rect["height"])

            click_world(335, 135)
            click_world(400, 220)
            page.wait_for_function(f"document.querySelector('#status-line').textContent.includes('{before + 1} road')")
            page.locator("#undo-btn").click()
            page.wait_for_function(f"document.querySelector('#status-line').textContent.includes('{before} road')")

            class Router:
                def predict(self, note, questions):
                    return {"answers": {"mode": {"choice": "cautious", "confidence": 0.9}, "risk": {"score": 1.0}}}

            monkeypatch.setitem(sys.modules, "laya", SimpleNamespace(Router=Router))
            _router.cache_clear()
            page.locator("#mission-note").fill("Fog near school")
            page.locator("#mission-btn").click()
            page.wait_for_function("document.querySelector('#mission-result').textContent.includes('CAUTIOUS')")
            assert "speed cap 10" in page.locator("#mission-result").inner_text()
            assert not errors
            browser.close()
    finally:
        _router.cache_clear()
        http.shutdown()
        http.server_close()
        thread.join(timeout=2)
