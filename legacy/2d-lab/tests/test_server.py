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
    app.speed_cap = 3
    app.tick(10)
    assert all(car.speed <= 3 for car in app.cars)
    app.set_route("0-3", "4-0")
    assert app.start == "0-3"
    assert json.loads((tmp_path / "world.json").read_text())["goal"] == "4-0"
    reopened = server.App()
    assert (reopened.start, reopened.goal) == ("0-3", "4-0")
    with pytest.raises(ValueError):
        app.tick(11)
    app.activate_preset("switchback")
    assert app.start == "s0" and app.goal == "s6"
    assert app.snapshot()["world_name"] == "Switchback"
    assert not app.snapshot()["model_ready"]
    app.activate_preset("city")
    assert app.snapshot()["model_ready"]
    replay = app.replay()
    assert set(replay["policies"]) == {"reference", "learned"}
    assert replay["policies"]["reference"]["trace"][0] == replay["policies"]["learned"]["trace"][0]
    assert replay["policies"]["learned"]["arrived"]


def test_http_api_state_validation_and_static_assets(app):
    http = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(app))
    thread = threading.Thread(target=http.serve_forever, daemon=True)
    thread.start()
    root = f"http://127.0.0.1:{http.server_port}"
    try:
        with urlopen(root + "/api/state") as response:
            state = json.load(response)
        assert state["model_ready"]
        with urlopen(root + "/api/presets") as response:
            assert len(json.load(response)["presets"]) == 3
        with urlopen(root + "/") as response:
            assert b"Road world simulator" in response.read()
        with pytest.raises(HTTPError) as error:
            urlopen(root + "/../../private")
        assert error.value.code == 404
        request = Request(
            root + "/api/route",
            data=b'{"start":"missing","goal":"0-0"}',
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with pytest.raises(HTTPError) as error:
            urlopen(request)
        assert error.value.code == 400
        foreign = Request(
            root + "/api/tick",
            data=b'{"frames":1}',
            headers={"Content-Type": "application/json", "Origin": "https://unrelated.example"},
            method="POST",
        )
        with pytest.raises(HTTPError) as error:
            urlopen(foreign)
        assert error.value.code == 403
        wrong_type = Request(root + "/api/tick", data=b'{"frames":1}', method="POST")
        with pytest.raises(HTTPError) as error:
            urlopen(wrong_type)
        assert error.value.code == 415
    finally:
        http.shutdown()
        http.server_close()
        thread.join(timeout=2)


def test_server_handlers_keep_app_instances_separate(app, tmp_path):
    other = server.App()
    other.set_route("0-3", "4-0")
    assert server.make_handler(app).app is app
    assert server.make_handler(other).app is other
    assert app.start != other.start


def test_failed_world_persistence_does_not_change_active_state(app, monkeypatch):
    before = app.snapshot()

    def fail_write(*_args):
        raise OSError("disk unavailable")

    monkeypatch.setattr(server, "_write_json", fail_write)
    with pytest.raises(OSError, match="disk unavailable"):
        app.set_route("0-3", "4-0")
    assert app.snapshot() == before
