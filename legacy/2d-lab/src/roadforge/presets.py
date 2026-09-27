"""Curated worlds for driving, editing and out-of-city evaluation."""

from __future__ import annotations

from roadforge.sample import DEFAULT_GOAL, DEFAULT_START, sample_world
from roadforge.world import Point, Road, World


def _chain(points: list[tuple[float, float]], width: float = 60) -> tuple[World, str, str]:
    nodes = {f"s{i}": Point(*position) for i, position in enumerate(points)}
    roads = [Road(f"s{i}", f"s{i + 1}") for i in range(len(points) - 1)]
    return World(nodes, roads, width), "s0", f"s{len(points) - 1}"


def city() -> tuple[World, str, str]:
    return sample_world(), DEFAULT_START, DEFAULT_GOAL


def switchback() -> tuple[World, str, str]:
    return _chain([(100, 135), (335, 135), (335, 365), (615, 365), (615, 145), (900, 145), (900, 600)], 68)


def zigzag() -> tuple[World, str, str]:
    return _chain([(90, 410), (240, 290), (390, 410), (540, 290), (690, 410), (840, 290), (970, 410)], 64)


PRESETS = {"city": ("City grid", city), "switchback": ("Switchback", switchback), "zigzag": ("Zigzag", zigzag)}
