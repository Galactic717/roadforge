from pathlib import Path

import pytest

from roadforge.learning import Network, demonstrations, train
from roadforge.presets import PRESETS
from roadforge.sample import DEFAULT_GOAL, DEFAULT_START, sample_world
from roadforge.sim import Route, expert, rollout, spawn, step


@pytest.fixture(scope="module")
def scenario():
    world = sample_world()
    return world, Route(world, world.route(DEFAULT_START, DEFAULT_GOAL))


def test_expert_reaches_goal_and_dynamics_are_deterministic(scenario):
    world, route = scenario
    first = rollout(world, route, expert)
    second = rollout(world, route, expert)
    assert first.finished and first.reason == "arrived"
    assert first == second
    car = spawn(route)
    step(world, route, car, 0, 1)
    assert car.speed > 0 and car.progress > 0
    for _ in range(100):
        step(world, route, car, 0, 1, speed_cap=4)
    assert car.speed <= 4


def test_learning_reduces_loss_and_model_reaches_goal(scenario, tmp_path: Path):
    world, route = scenario
    model, metrics = train(world, route, samples=300, epochs=8, seed=7)
    assert metrics["loss"][-1] < metrics["loss"][0] * 0.3
    assert metrics["learned"]["arrived"]
    path = tmp_path / "model.json"
    model.save(path)
    loaded = Network.load(path)
    sample = demonstrations(world, route, count=1)[0][0]
    assert loaded.drive(sample) == model.drive(sample)


def test_bad_model_shape_rejected(tmp_path: Path):
    path = tmp_path / "bad.json"
    path.write_text('{"version":1,"inputs":8,"hidden":12,"w1":[],"b1":[],"w2":[],"b2":[]}', encoding="utf-8")
    with pytest.raises(ValueError, match="dimensions"):
        Network.load(path)


def test_training_limits_and_nonfinite_weights(scenario, tmp_path: Path):
    world, route = scenario
    with pytest.raises(ValueError, match="out of range"):
        train(world, route, epochs=0)
    model = Network.random()
    model.b1[0] = float("nan")
    path = tmp_path / "invalid.json"
    model.save(path)
    with pytest.raises(ValueError, match="finite"):
        Network.load(path)


@pytest.mark.parametrize("preset", ["city", "switchback", "zigzag"])
def test_committed_model_arrives_on_each_preset(preset):
    path = Path(__file__).resolve().parents[1] / "data" / "pretrained_model.json"
    model = Network.load(path)
    world, start, goal = PRESETS[preset][1]()
    route = Route(world, world.route(start, goal))
    assert rollout(world, route, model.drive).finished
