"""Road geometry, validated world documents and shortest-path routing."""

from __future__ import annotations

from dataclasses import dataclass
from heapq import heappop, heappush
from math import hypot, isfinite
from typing import Any


@dataclass(frozen=True, slots=True)
class Point:
    x: float
    y: float

    def distance(self, other: Point) -> float:
        return hypot(self.x - other.x, self.y - other.y)


@dataclass(frozen=True, slots=True)
class Road:
    a: str
    b: str


def project(point: Point, a: Point, b: Point) -> tuple[Point, float]:
    dx, dy = b.x - a.x, b.y - a.y
    square = dx * dx + dy * dy
    if square < 1e-9:
        return a, 0.0
    t = max(0.0, min(1.0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / square))
    return Point(a.x + t * dx, a.y + t * dy), t


class World:
    def __init__(self, nodes: dict[str, Point], roads: list[Road], width: float = 58):
        if not 16 <= width <= 120:
            raise ValueError("road width must be between 16 and 120")
        if not 2 <= len(nodes) <= 250 or not 1 <= len(roads) <= 600:
            raise ValueError("world requires 2–250 nodes and 1–600 roads")
        if any(not isfinite(v) or abs(v) > 10000 for p in nodes.values() for v in (p.x, p.y)):
            raise ValueError("coordinates must be finite and within ±10000")
        seen: set[frozenset[str]] = set()
        for road in roads:
            if road.a not in nodes or road.b not in nodes or road.a == road.b:
                raise ValueError("road endpoints must be different existing nodes")
            key = frozenset((road.a, road.b))
            if key in seen or nodes[road.a].distance(nodes[road.b]) < 16:
                raise ValueError("duplicate or too-short road")
            seen.add(key)
        self.nodes, self.roads, self.width = nodes, roads, float(width)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> World:
        if (not isinstance(data, dict) or not isinstance(data.get("nodes"), dict)
                or not isinstance(data.get("roads"), list)):
            raise ValueError("world requires nodes and roads")
        try:
            nodes = {str(k): Point(float(v["x"]), float(v["y"])) for k, v in data["nodes"].items()}
            roads = [Road(str(v["a"]), str(v["b"])) for v in data["roads"]]
            width = float(data.get("width", 58))
        except (TypeError, KeyError, ValueError) as exc:
            raise ValueError("invalid world data") from exc
        return cls(nodes, roads, width)

    def to_dict(self) -> dict[str, Any]:
        return {"nodes": {k: {"x": p.x, "y": p.y} for k, p in self.nodes.items()},
                "roads": [{"a": r.a, "b": r.b} for r in self.roads], "width": self.width}

    def route(self, start: str, goal: str) -> list[str]:
        if start not in self.nodes or goal not in self.nodes or start == goal:
            raise ValueError("choose two different nodes")
        graph: dict[str, list[tuple[str, float]]] = {k: [] for k in self.nodes}
        for road in self.roads:
            length = self.nodes[road.a].distance(self.nodes[road.b])
            graph[road.a].append((road.b, length))
            graph[road.b].append((road.a, length))
        queue = [(0.0, start)]
        distances = {start: 0.0}
        previous: dict[str, str] = {}
        while queue:
            cost, node = heappop(queue)
            if cost > distances[node]:
                continue
            if node == goal:
                result = [goal]
                while result[-1] != start:
                    result.append(previous[result[-1]])
                return result[::-1]
            for next_node, length in graph[node]:
                candidate = cost + length
                if candidate < distances.get(next_node, float("inf")):
                    distances[next_node], previous[next_node] = candidate, node
                    heappush(queue, (candidate, next_node))
        raise ValueError("selected nodes are disconnected")

    def road_distance(self, point: Point) -> float:
        return min(point.distance(project(point, self.nodes[r.a], self.nodes[r.b])[0]) for r in self.roads)

    def on_road(self, point: Point, margin: float = 0) -> bool:
        return self.road_distance(point) <= self.width / 2 - margin

    def ray_distance(self, origin: Point, angle: float, maximum: float = 90, step: float = 5) -> float:
        from math import cos, sin

        distance = 0.0
        while distance < maximum:
            distance = min(maximum, distance + step)
            if not self.on_road(Point(origin.x + cos(angle) * distance, origin.y + sin(angle) * distance)):
                return distance
        return maximum
