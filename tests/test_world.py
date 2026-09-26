import pytest

from roadforge.sample import sample_world
from roadforge.world import Point, Road, World, project


def test_shortest_route_chooses_lower_distance():
    world = World({"a": Point(0, 0), "b": Point(30, 0), "c": Point(70, 0), "d": Point(30, 50)},
                  [Road("a", "b"), Road("b", "c"), Road("a", "d"), Road("d", "c")])
    assert world.route("a", "c") == ["a", "b", "c"]


def test_disconnected_route_is_rejected():
    world = World({"a": Point(0, 0), "b": Point(50, 0), "c": Point(100, 0)}, [Road("a", "b")])
    with pytest.raises(ValueError, match="disconnected"):
        world.route("a", "c")


@pytest.mark.parametrize("bad", [
    {"nodes": {"a": {"x": 0, "y": 0}, "b": {"x": 1, "y": 0}}, "roads": [{"a": "a", "b": "b"}]},
    {"nodes": {"a": {"x": 0, "y": 0}, "b": {"x": 50, "y": 0}}, "roads": [{"a": "a", "b": "b"}, {"a": "b", "b": "a"}]},
    {"nodes": {"a": {"x": float("nan"), "y": 0}, "b": {"x": 50, "y": 0}}, "roads": [{"a": "a", "b": "b"}]},
])
def test_rejects_invalid_worlds(bad):
    with pytest.raises(ValueError):
        World.from_dict(bad)


def test_geometry_and_roundtrip():
    world = sample_world()
    assert World.from_dict(world.to_dict()).to_dict() == world.to_dict()
    nearest, t = project(Point(25, 30), Point(0, 0), Point(50, 0))
    assert nearest == Point(25, 0)
    assert t == 0.5
    assert world.on_road(world.nodes["0-0"])
    assert not world.on_road(Point(1, 1))
    assert 0 < world.ray_distance(world.nodes["0-0"], 0) <= 90
