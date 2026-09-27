"""Paired closed-loop evaluation and durable local experiment records."""

from __future__ import annotations

import hashlib
import random
import sqlite3
from datetime import datetime, timezone
from math import cos, sin
from pathlib import Path

from roadforge.learning import Network
from roadforge.presets import PRESETS
from roadforge.sim import Car, Route, expert, rollout
from roadforge.world import Point, Road, World

SUITE_VERSION = 1
STRESS_SEEDS = (11, 23, 37, 53, 71)
# Progress, lateral position as a fraction of road width, heading error (radians), speed.
STARTS = (
    ("nominal", 0.0, 0.0, 0.0, 0.0),
    ("left_edge", 0.15, 0.35, 0.4, 12.0),
    ("right_edge", 0.15, -0.35, -0.4, 12.0),
    ("left_heading", 0.35, 0.0, 0.6, 15.0),
    ("right_heading", 0.35, 0.0, -0.6, 15.0),
    ("late_left_edge", 0.6, 0.3, 0.2, 15.0),
    ("late_right_edge", 0.6, -0.3, -0.2, 15.0),
)


def generated_stress_world(seed: int) -> tuple[World, str, str]:
    """Make an x-monotonic chain with repeatable right-angle turns."""
    rng = random.Random(seed)
    levels = [0.0, rng.uniform(120, 210), -rng.uniform(120, 210), rng.uniform(120, 210)]
    points = [(0.0, 0.0)]
    x = 0.0
    for level in levels[1:]:
        x += rng.uniform(170, 240)
        points.append((x, points[-1][1]))
        points.append((x, level))
    x += rng.uniform(170, 240)
    points.append((x, points[-1][1]))
    nodes = {f"g{i}": Point(*point) for i, point in enumerate(points)}
    roads = [Road(f"g{i}", f"g{i + 1}") for i in range(len(points) - 1)]
    return World(nodes, roads, width=rng.uniform(36, 60)), "g0", f"g{len(points) - 1}"


def evaluate_suite(model: Network, max_steps: int = 1900, stress: bool = False) -> dict:
    """Run both policies from exactly the same poses on every preset.

    These small, hand-built layouts are a regression suite, not a statistical
    estimate of performance on arbitrary road networks.
    """
    if not 1 <= max_steps <= 10000:
        raise ValueError("max_steps must be between 1 and 10000")
    cases = []
    scenarios = [(world_id, factory()) for world_id, (_, factory) in PRESETS.items()]
    if stress:
        scenarios.extend((f"generated-{seed}", generated_stress_world(seed)) for seed in STRESS_SEEDS)
    for world_id, (world, start, goal) in scenarios:
        route = Route(world, world.route(start, goal))
        for case_id, fraction, lateral, heading_error, initial_speed in STARTS:
            progress = route.total * fraction
            point, heading = route.at(progress)
            offset = lateral * world.width
            initial = Car(
                point.x - sin(heading) * offset,
                point.y + cos(heading) * offset,
                heading + heading_error,
                speed=initial_speed,
                progress=progress,
            )
            for policy_name, policy in (("reference", expert), ("learned", model.drive)):
                car = rollout(world, route, policy, max_steps=max_steps, initial=initial)
                cases.append(
                    {
                        "world": world_id,
                        "start": case_id,
                        "start_fraction": fraction,
                        "lateral_fraction": lateral,
                        "heading_error_rad": heading_error,
                        "initial_speed": initial_speed,
                        "policy": policy_name,
                        "arrived": car.finished,
                        "completion": round(car.progress / route.total, 4),
                        "ticks": car.ticks,
                        "reason": car.reason,
                    }
                )
    summary = {}
    for name in ("reference", "learned"):
        rows = [case for case in cases if case["policy"] == name]
        summary[name] = {
            "arrivals": sum(case["arrived"] for case in rows),
            "total": len(rows),
            "mean_completion": round(sum(case["completion"] for case in rows) / len(rows), 4),
        }
    return {
        "suite_version": SUITE_VERSION + int(stress),
        "suite": "stress" if stress else "presets",
        "max_steps": max_steps,
        "summary": summary,
        "cases": cases,
    }


def model_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.execute("PRAGMA foreign_keys = ON")
    version = connection.execute("PRAGMA user_version").fetchone()[0]
    if version not in (0, 1):
        connection.close()
        raise ValueError(f"unsupported experiment database version: {version}")
    with connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS runs (
                id INTEGER PRIMARY KEY,
                created_at TEXT NOT NULL,
                model_sha256 TEXT NOT NULL,
                model_path TEXT NOT NULL,
                suite_version INTEGER NOT NULL,
                max_steps INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS cases (
                run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
                world TEXT NOT NULL,
                start TEXT NOT NULL,
                start_fraction REAL NOT NULL,
                lateral_fraction REAL NOT NULL,
                heading_error_rad REAL NOT NULL,
                initial_speed REAL NOT NULL,
                policy TEXT NOT NULL CHECK(policy IN ('reference', 'learned')),
                arrived INTEGER NOT NULL CHECK(arrived IN (0, 1)),
                completion REAL NOT NULL,
                ticks INTEGER NOT NULL,
                reason TEXT NOT NULL,
                PRIMARY KEY (run_id, world, start, policy)
            );
            CREATE INDEX IF NOT EXISTS cases_run_policy ON cases(run_id, policy);
            PRAGMA user_version = 1;
            """
        )
    return connection


def save_run(path: Path, model_path: Path, result: dict) -> int:
    """Insert one whole evaluation atomically; return its database id."""
    connection = _connect(path)
    try:
        with connection:
            cursor = connection.execute(
                "INSERT INTO runs(created_at, model_sha256, model_path, suite_version, max_steps) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    datetime.now(timezone.utc).isoformat(),
                    model_sha256(model_path),
                    str(model_path),
                    result["suite_version"],
                    result["max_steps"],
                ),
            )
            run_id = cursor.lastrowid
            connection.executemany(
                "INSERT INTO cases(run_id, world, start, start_fraction, lateral_fraction, "
                "heading_error_rad, initial_speed, policy, arrived, completion, ticks, reason) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    (
                        run_id,
                        case["world"],
                        case["start"],
                        case["start_fraction"],
                        case["lateral_fraction"],
                        case["heading_error_rad"],
                        case["initial_speed"],
                        case["policy"],
                        int(case["arrived"]),
                        case["completion"],
                        case["ticks"],
                        case["reason"],
                    )
                    for case in result["cases"]
                ),
            )
        return run_id
    finally:
        connection.close()


def list_runs(path: Path, limit: int = 20) -> list[dict]:
    if not 1 <= limit <= 100:
        raise ValueError("limit must be between 1 and 100")
    if not path.exists():
        return []
    connection = _connect(path)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute(
            """
            SELECT r.id, r.created_at, r.model_sha256, r.model_path, r.suite_version,
                   SUM(CASE WHEN c.policy = 'reference' AND c.arrived = 1 THEN 1 ELSE 0 END) AS reference_arrivals,
                   SUM(CASE WHEN c.policy = 'learned' AND c.arrived = 1 THEN 1 ELSE 0 END) AS learned_arrivals,
                   SUM(CASE WHEN c.policy = 'learned' THEN 1 ELSE 0 END) AS total
            FROM runs AS r JOIN cases AS c ON c.run_id = r.id
            GROUP BY r.id ORDER BY r.id DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()
