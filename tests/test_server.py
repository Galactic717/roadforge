import json
import threading
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest

from roadforge import server


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "DATA", tmp_path)
    monkeypatch.setattr(server, "WORLD_FILE", tmp_path / "world.json")
    monkeypatch.setattr(server, "MODEL_FILE", tmp_path / "model.json")
    monkeypatch.setattr(server, "MODEL_META", tmp_path / "model_meta.json")
    return server.App()


def test_fleet_tick_and_route_persistence(app, tmp_path):
    initial = app.cars[-1].progress
    app.tick(10)
    assert app.cars[-1].progress > initial
    app.set_route("0-3", "4-0")
    assert app.start == "0-3"
    assert json.loads((tmp_path / "world.json").read_text())["goal"] == "4-0"
    reopened = server.App()
    assert (reopened.start, reopened.goal) == ("0-3", "4-0")
    with pytest.raises(ValueError):
        app.tick(11)


def test_http_api_state_validation_and_static_assets(app):
    server.Handler.app = app
    http = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    thread = threading.Thread(target=http.serve_forever, daemon=True)
    thread.start()
    root = f"http://127.0.0.1:{http.server_port}"
    try:
        with urlopen(root + "/api/state") as response:
            state = json.load(response)
        assert state["model_ready"]
        with urlopen(root + "/") as response:
            assert b"Autonomous world" in response.read()
        with pytest.raises(HTTPError) as error:
            urlopen(root + "/../../private")
        assert error.value.code == 404
        request = Request(root + "/api/route", data=b'{"start":"missing","goal":"0-0"}',
                          headers={"Content-Type": "application/json"}, method="POST")
        with pytest.raises(HTTPError) as error:
            urlopen(request)
        assert error.value.code == 400
    finally:
        http.shutdown()
        http.server_close()
        thread.join(timeout=2)
