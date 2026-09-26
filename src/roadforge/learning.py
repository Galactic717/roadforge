"""Small neural policy trained from geometry-based demonstrations.

The expert generates labels. Backpropagation fits a neural policy; evaluation
always runs the learned weights without consulting the expert.
"""

from __future__ import annotations

import json
import random
from dataclasses import dataclass
from math import cos, isfinite, sin, tanh
from pathlib import Path

from roadforge.sim import Car, Route, expert, observe, rollout
from roadforge.world import World

INPUTS, HIDDEN, OUTPUTS = 8, 12, 2


@dataclass
class Network:
    w1: list[list[float]]
    b1: list[float]
    w2: list[list[float]]
    b2: list[float]

    @classmethod
    def random(cls, seed: int = 7) -> Network:
        rng = random.Random(seed)
        return cls(
            [[rng.uniform(-0.3, 0.3) for _ in range(INPUTS)] for _ in range(HIDDEN)],
            [0.0] * HIDDEN,
            [[rng.uniform(-0.3, 0.3) for _ in range(HIDDEN)] for _ in range(OUTPUTS)],
            [0.0] * OUTPUTS,
        )

    def forward(self, features: list[float]) -> tuple[list[float], list[float]]:
        hidden = [
            tanh(sum(w * x for w, x in zip(row, features, strict=True)) + bias)
            for row, bias in zip(self.w1, self.b1, strict=True)
        ]
        output = [
            tanh(sum(w * x for w, x in zip(row, hidden, strict=True)) + bias)
            for row, bias in zip(self.w2, self.b2, strict=True)
        ]
        return hidden, output

    def drive(self, features: list[float]) -> tuple[float, float]:
        _, output = self.forward(features)
        return output[0], (output[1] + 1) / 2

    def fit(
        self,
        samples: list[tuple[list[float], tuple[float, float]]],
        epochs: int = 24,
        rate: float = 0.018,
        seed: int = 7,
    ) -> list[float]:
        rng = random.Random(seed)
        history = []
        for _ in range(epochs):
            rng.shuffle(samples)
            total = 0.0
            for features, label in samples:
                hidden, output = self.forward(features)
                targets = [label[0], label[1] * 2 - 1]
                delta2 = [
                    (actual - target) * (1 - actual * actual) for actual, target in zip(output, targets, strict=True)
                ]
                delta1 = [
                    (1 - hidden[j] ** 2) * sum(delta2[k] * self.w2[k][j] for k in range(OUTPUTS)) for j in range(HIDDEN)
                ]
                total += sum((a - b) ** 2 for a, b in zip(output, targets, strict=True)) / 2
                for k in range(OUTPUTS):
                    for j in range(HIDDEN):
                        self.w2[k][j] -= rate * delta2[k] * hidden[j]
                    self.b2[k] -= rate * delta2[k]
                for j in range(HIDDEN):
                    for i in range(INPUTS):
                        self.w1[j][i] -= rate * delta1[j] * features[i]
                    self.b1[j] -= rate * delta1[j]
            history.append(total / len(samples))
        return history

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(path.name + ".tmp")
        temporary.write_text(
            json.dumps(
                {
                    "version": 1,
                    "inputs": INPUTS,
                    "hidden": HIDDEN,
                    "w1": self.w1,
                    "b1": self.b1,
                    "w2": self.w2,
                    "b2": self.b2,
                }
            ),
            encoding="utf-8",
        )
        temporary.replace(path)

    @classmethod
    def load(cls, path: Path) -> Network:
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("version") != 1 or data.get("inputs") != INPUTS or data.get("hidden") != HIDDEN:
            raise ValueError("unsupported network format")
        net = cls(data["w1"], data["b1"], data["w2"], data["b2"])
        if (
            len(net.w1) != HIDDEN
            or any(len(row) != INPUTS for row in net.w1)
            or len(net.b1) != HIDDEN
            or len(net.w2) != OUTPUTS
            or any(len(row) != HIDDEN for row in net.w2)
            or len(net.b2) != OUTPUTS
        ):
            raise ValueError("invalid network dimensions")
        values = [value for layer in (net.w1, net.w2) for row in layer for value in row] + net.b1 + net.b2
        if any(not isinstance(value, (int, float)) or not isfinite(value) for value in values):
            raise ValueError("network weights must be finite numbers")
        return net


def demonstrations(world: World, route: Route, count: int = 1100, seed: int = 7):
    rng = random.Random(seed)
    samples = []
    for _ in range(count):
        progress = rng.uniform(0, route.total - 12)
        point, heading = route.at(progress)
        lateral = rng.uniform(-world.width * 0.27, world.width * 0.27)
        car = Car(
            point.x - sin(heading) * lateral,
            point.y + cos(heading) * lateral,
            heading + rng.uniform(-0.52, 0.52),
            speed=rng.uniform(0, 20),
            progress=progress,
        )
        features = observe(world, route, car)
        samples.append((features, expert(features)))
    return samples


def train(
    world: World, route: Route, *, seed: int = 7, samples: int = 1100, epochs: int = 24, progress=None
) -> tuple[Network, dict]:
    if not 1 <= epochs <= 80 or not 100 <= samples <= 3000 or not 0 <= seed <= 2**31 - 1:
        raise ValueError("epochs, samples or seed out of range")
    dataset = demonstrations(world, route, samples, seed)
    network = Network.random(seed)
    # Batch by epoch so a caller can expose progress without any ML framework.
    losses = []
    for epoch in range(epochs):
        losses.extend(network.fit(dataset, epochs=1, seed=seed + epoch))
        if progress:
            progress(epoch + 1, epochs, losses[-1])
    expert_car = rollout(world, route, expert)
    learned_car = rollout(world, route, network.drive)
    metrics = {
        "seed": seed,
        "samples": samples,
        "epochs": epochs,
        "loss": [round(v, 6) for v in losses],
        "expert": {"completion": round(expert_car.progress / route.total, 3), "arrived": expert_car.finished},
        "learned": {
            "completion": round(learned_car.progress / route.total, 3),
            "arrived": learned_car.finished,
            "reason": learned_car.reason,
        },
    }
    return network, metrics
