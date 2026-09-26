"""Command-line entry points for serving, training and evaluation."""

import argparse
import json
from pathlib import Path

from roadforge.learning import Network, train
from roadforge.presets import PRESETS
from roadforge.sample import DEFAULT_GOAL, DEFAULT_START, sample_world
from roadforge.server import serve
from roadforge.sim import Route, expert, rollout


def main() -> None:
    parser = argparse.ArgumentParser(prog="roadforge")
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("serve", help="start the local web app")
    run.add_argument("--host", default="127.0.0.1")
    run.add_argument("--port", type=int, default=8765)
    fit = commands.add_parser("train", help="train on the included city and save model")
    fit.add_argument("--epochs", type=int, default=24)
    fit.add_argument("--samples", type=int, default=1100)
    fit.add_argument("--seed", type=int, default=7)
    fit.add_argument("--output", type=Path, default=Path("data/model.json"))
    test = commands.add_parser("evaluate", help="measure model completion on the included city")
    test.add_argument("--model", type=Path, default=Path("data/pretrained_model.json"))
    benchmark = commands.add_parser("benchmark", help="evaluate a model on all included worlds")
    benchmark.add_argument("--model", type=Path, default=Path("data/pretrained_model.json"))
    args = parser.parse_args()
    if args.command == "serve":
        serve(args.host, args.port)
        return
    world = sample_world()
    route = Route(world, world.route(DEFAULT_START, DEFAULT_GOAL))
    if args.command == "train":
        model, metrics = train(world, route, seed=args.seed, samples=args.samples, epochs=args.epochs)
        model.save(args.output)
        print(json.dumps(metrics, indent=2))
    elif args.command == "evaluate":
        model = Network.load(args.model)
        result = {
            name: {
                "arrived": car.finished,
                "completion": round(car.progress / route.total, 3),
                "reason": car.reason,
                "ticks": car.ticks,
            }
            for name, car in (
                ("expert", rollout(world, route, expert)),
                ("learned", rollout(world, route, model.drive)),
            )
        }
        print(json.dumps(result, indent=2))
    else:
        model = Network.load(args.model)
        rows = []
        for key, (name, factory) in PRESETS.items():
            scenario, start, goal = factory()
            course = Route(scenario, scenario.route(start, goal))
            reference = rollout(scenario, course, expert)
            learned = rollout(scenario, course, model.drive)
            rows.append(
                {
                    "world": key,
                    "name": name,
                    "reference_arrived": reference.finished,
                    "learned_arrived": learned.finished,
                    "learned_completion": round(learned.progress / course.total, 3),
                    "learned_ticks": learned.ticks,
                }
            )
        print(
            json.dumps(
                {
                    "model": str(args.model),
                    "results": rows,
                    "arrivals": sum(row["learned_arrived"] for row in rows),
                    "total": len(rows),
                },
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
