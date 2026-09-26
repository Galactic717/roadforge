"""Dependency-free local HTTP application and JSON API."""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from roadforge.learning import Network, train
from roadforge.mission import classify_mission
from roadforge.sample import DEFAULT_GOAL, DEFAULT_START, sample_world
from roadforge.sim import Route, expert, observe, spawn, step
from roadforge.world import Point, World

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"
DATA = ROOT / "data"
PRETRAINED = DATA / "pretrained_model.json"
MODEL_FILE = DATA / "model.json"
MODEL_META = DATA / "model_meta.json"
WORLD_FILE = DATA / "world.json"


class App:
    def __init__(self):
        self.lock = threading.RLock()
        saved = json.loads(WORLD_FILE.read_text(encoding="utf-8")) if WORLD_FILE.exists() else None
        world_data = saved["world"] if saved and "world" in saved else saved
        self.world = World.from_dict(world_data) if world_data else sample_world()
        self.start = str(saved.get("start", DEFAULT_START)) if saved else DEFAULT_START
        self.goal = str(saved.get("goal", DEFAULT_GOAL)) if saved else DEFAULT_GOAL
        try:
            self.route = Route(self.world, self.world.route(self.start, self.goal))
        except ValueError:
            self.start = self.world.roads[0].a
            self.goal = self.world.roads[0].b
            self.route = Route(self.world, self.world.route(self.start, self.goal))
        self.model = None
        self.model_key = None
        if MODEL_FILE.exists() and MODEL_META.exists():
            metadata = json.loads(MODEL_META.read_text(encoding="utf-8"))
            if metadata.get("key") == self.key():
                self.model = Network.load(MODEL_FILE)
                self.model_key = self.key()
        elif (PRETRAINED.exists() and self.world.to_dict() == sample_world().to_dict()
              and self.start == DEFAULT_START and self.goal == DEFAULT_GOAL):
            self.model = Network.load(PRETRAINED)
            self.model_key = self.key()
        self.cars = []
        self.mode = "learned" if self.model else "expert"
        self.speed_cap = 19
        self.mission = None
        self.training: dict[str, Any] = {"running": False, "epoch": 0, "epochs": 0}
        self.reset_fleet()

    def key(self) -> str:
        return json.dumps({"world": self.world.to_dict(), "route": [self.start, self.goal]}, sort_keys=True)

    def reset_fleet(self, count: int = 6) -> None:
        if not 1 <= count <= 12:
            raise ValueError("fleet size must be 1–12")
        self.cars = [spawn(self.route, min(i * 31.0, max(0, self.route.total - 40))) for i in range(count)]

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            return {"world": self.world.to_dict(), "start": self.start, "goal": self.goal,
                    "route": self.world.route(self.start, self.goal), "cars": [c.to_dict() for c in self.cars],
                    "mode": self.mode, "model_ready": self.model is not None and self.model_key == self.key(),
                    "training": self.training.copy(), "mission": self.mission,
                    "speed_cap": self.speed_cap}

    def set_world(self, payload: dict) -> None:
        world = World.from_dict(payload["world"])
        start, goal = str(payload["start"]), str(payload["goal"])
        route = Route(world, world.route(start, goal))
        with self.lock:
            if self.training["running"]:
                raise ValueError("wait until training finishes before editing the world")
            self.world, self.start, self.goal, self.route = world, start, goal, route
            self.mode = "learned" if self.model_key == self.key() else "expert"
            self.reset_fleet()
            DATA.mkdir(exist_ok=True)
            document = {"world": world.to_dict(), "start": start, "goal": goal}
            WORLD_FILE.write_text(json.dumps(document, indent=2), encoding="utf-8")

    def set_route(self, start: str, goal: str) -> None:
        with self.lock:
            if self.training["running"]:
                raise ValueError("wait until training finishes before changing the route")
            route = Route(self.world, self.world.route(start, goal))
            self.start, self.goal, self.route = start, goal, route
            self.mode = "learned" if self.model_key == self.key() else "expert"
            self.reset_fleet()
            DATA.mkdir(exist_ok=True)
            document = {"world": self.world.to_dict(), "start": start, "goal": goal}
            WORLD_FILE.write_text(json.dumps(document, indent=2), encoding="utf-8")

    def tick(self, frames: int) -> dict[str, Any]:
        if not 1 <= frames <= 10:
            raise ValueError("frames must be 1–10")
        with self.lock:
            ready = self.mode == "learned" and self.model and self.model_key == self.key()
            policy = self.model.drive if ready else expert
            for _ in range(frames):
                for car in self.cars:
                    if car.alive and not car.finished:
                        steer, throttle = policy(observe(self.world, self.route, car))
                        if car.speed >= self.speed_cap:
                            throttle = 0.0
                        step(self.world, self.route, car, steer, throttle)
                for i, left in enumerate(self.cars):
                    for right in self.cars[i + 1 :]:
                        if left.alive and right.alive and Point(left.x, left.y).distance(Point(right.x, right.y)) < 10:
                            left.alive = right.alive = False
                            left.reason = right.reason = "collision"
            return {"cars": [car.to_dict() for car in self.cars]}

    def start_training(self, epochs: int = 24, samples: int = 1100, seed: int = 7) -> None:
        if not 1 <= epochs <= 80 or not 100 <= samples <= 3000 or not 0 <= seed <= 2**31 - 1:
            raise ValueError("epochs, samples or seed out of range")
        with self.lock:
            if self.training["running"]:
                raise ValueError("training is already running")
            world, route, key = self.world, self.route, self.key()
            self.training = {"running": True, "epoch": 0, "epochs": epochs, "loss": None}

        def worker():
            try:
                def progress(epoch, total, loss):
                    with self.lock:
                        self.training.update(epoch=epoch, epochs=total, loss=round(loss, 6))

                model, metrics = train(world, route, seed=seed, samples=samples, epochs=epochs, progress=progress)
                with self.lock:
                    model.save(MODEL_FILE)
                    MODEL_META.write_text(json.dumps({"key": key}), encoding="utf-8")
                    self.model, self.model_key = model, key
                    self.training.update(running=False, metrics=metrics)
                    self.mode = "learned"
                    self.reset_fleet()
            except Exception as exc:  # worker must expose failure rather than silently disappear
                with self.lock:
                    self.training.update(running=False, error=str(exc))

        threading.Thread(target=worker, name="roadforge-training", daemon=True).start()


class Handler(BaseHTTPRequestHandler):
    app: App

    def _json(self, status: int, data: Any) -> None:
        body = json.dumps(data, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/state":
            return self._json(200, self.app.snapshot())
        if path == "/api/health":
            return self._json(200, {"status": "ok"})
        assets = {"/": ("index.html", "text/html"), "/app.js": ("app.js", "text/javascript"),
                  "/style.css": ("style.css", "text/css")}
        if path not in assets:
            return self._json(404, {"error": "not found"})
        filename, content_type = assets[path]
        body = (WEB / filename).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 <= length <= 1_000_000:
                raise ValueError("request body too large")
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValueError("request must be an object")
            path = urlparse(self.path).path
            if path == "/api/world":
                self.app.set_world(body)
                response = self.app.snapshot()
            elif path == "/api/route":
                self.app.set_route(str(body["start"]), str(body["goal"]))
                response = self.app.snapshot()
            elif path == "/api/fleet":
                with self.app.lock:
                    mode = str(body.get("mode", self.app.mode))
                    if mode not in ("expert", "learned"):
                        raise ValueError("mode must be expert or learned")
                    if mode == "learned" and (not self.app.model or self.app.model_key != self.app.key()):
                        raise ValueError("train a model for this world and route first")
                    self.app.mode = mode
                    self.app.reset_fleet(int(body.get("count", 6)))
                response = self.app.snapshot()
            elif path == "/api/tick":
                response = self.app.tick(int(body.get("frames", 1)))
            elif path == "/api/train":
                self.app.start_training(int(body.get("epochs", 24)), int(body.get("samples", 1100)),
                                        int(body.get("seed", 7)))
                response = {"training": self.app.training}
            elif path == "/api/mission":
                decision = classify_mission(str(body["note"]))
                with self.app.lock:
                    self.app.mission, self.app.speed_cap = decision, decision["speed_cap"]
                response = decision
            else:
                return self._json(404, {"error": "not found"})
            self._json(200, response)
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            self._json(400, {"error": str(exc)})
        except RuntimeError as exc:
            self._json(503, {"error": str(exc)})


def serve(host: str = "127.0.0.1", port: int = 8765) -> None:
    Handler.app = App()
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"RoadForge is running at http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
