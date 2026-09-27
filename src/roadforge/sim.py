"""Deterministic point-vehicle dynamics and route-relative observations."""

from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from math import atan2, cos, pi, sin

from roadforge.world import Point, World, project

DT = 0.1
MAX_SPEED = 23.0


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def wrap(angle: float) -> float:
    return (angle + pi) % (2 * pi) - pi


class Route:
    def __init__(self, world: World, nodes: list[str]):
        if len(nodes) < 2:
            raise ValueError("route needs at least two nodes")
        self.points = [world.nodes[node] for node in nodes]
        self.lengths = [a.distance(b) for a, b in zip(self.points, self.points[1:], strict=False)]
        self.cumulative = [0.0]
        for length in self.lengths:
            self.cumulative.append(self.cumulative[-1] + length)
        self.total = self.cumulative[-1]

    def at(self, distance: float) -> tuple[Point, float]:
        distance = clamp(distance, 0, self.total)
        for i, length in enumerate(self.lengths):
            if distance <= self.cumulative[i + 1] or i == len(self.lengths) - 1:
                a, b = self.points[i : i + 2]
                t = (distance - self.cumulative[i]) / length
                return Point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t), atan2(b.y - a.y, b.x - a.x)
        raise AssertionError("unreachable")

    def locate(self, point: Point, previous: float = 0) -> tuple[float, float]:
        candidates = []
        for i, length in enumerate(self.lengths):
            nearest, t = project(point, self.points[i], self.points[i + 1])
            progress = self.cumulative[i] + t * length
            if progress >= previous - 25:
                candidates.append((point.distance(nearest), progress))
        if not candidates:
            return previous, float("inf")
        distance, progress = min(candidates)
        return max(previous, progress), distance


@dataclass(slots=True)
class Car:
    x: float
    y: float
    heading: float
    speed: float = 0
    progress: float = 0
    alive: bool = True
    finished: bool = False
    reason: str = "driving"
    ticks: int = 0

    def to_dict(self) -> dict:
        return asdict(self)


def spawn(route: Route, distance: float = 0) -> Car:
    point, heading = route.at(distance)
    return Car(point.x, point.y, heading, progress=distance)


def observe(world: World, route: Route, car: Car) -> list[float]:
    # The same features are used during training, evaluation and live simulation.
    here = Point(car.x, car.y)
    target, _ = route.at(car.progress + 42)
    desired = atan2(target.y - here.y, target.x - here.x)
    _, tangent = route.at(min(route.total, car.progress + 3))
    road_angle = wrap(tangent - car.heading)
    rays = [world.ray_distance(here, car.heading + offset) / 90 for offset in (-1.1, -0.5, 0, 0.5, 1.1)]
    return [wrap(desired - car.heading) / pi, road_angle / pi, car.speed / MAX_SPEED, *rays]


def expert(features: list[float]) -> tuple[float, float]:
    error = features[0] * pi
    steer = clamp(error * 1.9, -1, 1)
    target_speed = 11 if abs(error) > 0.55 else 17
    speed = features[2] * MAX_SPEED
    throttle = clamp((target_speed - speed) * 0.22 + 0.4, 0, 1)
    return steer, throttle


def step(world: World, route: Route, car: Car, steer: float, throttle: float, speed_cap: float = MAX_SPEED) -> None:
    if not car.alive or car.finished:
        return
    steer, throttle = clamp(steer, -1, 1), clamp(throttle, 0, 1)
    car.speed = clamp(car.speed + (throttle * 7.0 - 0.7 - car.speed * 0.09) * DT, 0, min(MAX_SPEED, speed_cap))
    car.heading = wrap(car.heading + steer * (0.35 + car.speed * 0.045) * DT)
    car.x += cos(car.heading) * car.speed * DT
    car.y += sin(car.heading) * car.speed * DT
    car.ticks += 1
    car.progress, _ = route.locate(Point(car.x, car.y), car.progress)
    if not world.on_road(Point(car.x, car.y), margin=5):
        car.alive, car.reason = False, "off road"
    elif car.progress >= route.total - 9 and Point(car.x, car.y).distance(route.points[-1]) < 13:
        car.finished, car.reason = True, "arrived"


def rollout(
    world: World,
    route: Route,
    policy,
    max_steps: int = 1900,
    start: float = 0,
    initial: Car | None = None,
    trace: list[dict] | None = None,
) -> Car:
    car = replace(initial) if initial is not None else spawn(route, start)
    if trace is not None:
        trace.append(car.to_dict())
    for _ in range(max_steps):
        steer, throttle = policy(observe(world, route, car))
        step(world, route, car, steer, throttle)
        if trace is not None:
            trace.append(car.to_dict())
        if car.finished or not car.alive:
            break
    if car.alive and not car.finished:
        car.reason = "time limit"
    return car
