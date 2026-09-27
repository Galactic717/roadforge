"""Command-line entry points for serving, training and evaluation."""

import argparse
import json
from pathlib import Path

from roadforge.evaluation import evaluate_suite, list_runs, save_run
from roadforge.learning import Network, train
from roadforge.sample import DEFAULT_GOAL, DEFAULT_START, sample_world
from roadforge.server import DATA, PRETRAINED, serve
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
    fit.add_argument("--output", type=Path, default=DATA / "model.json")
    test = commands.add_parser("evaluate", help="measure model completion on the included city")
    test.add_argument("--model", type=Path, default=PRETRAINED)
    benchmark = commands.add_parser("benchmark", help="run paired, perturbed closed-loop evaluations")
    benchmark.add_argument("--model", type=Path, default=PRETRAINED)
    benchmark.add_argument("--database", type=Path, default=DATA / "experiments.sqlite3")
    benchmark.add_argument("--max-steps", type=int, default=1900)
    benchmark.add_argument("--no-save", action="store_true", help="print results without adding an experiment record")
    benchmark.add_argument("--summary", action="store_true", help="print aggregate results without per-case rows")
    benchmark.add_argument("--stress", action="store_true", help="include five generated narrow-road layouts")
    history = commands.add_parser("history", help="list saved benchmark runs")
    history.add_argument("--database", type=Path, default=DATA / "experiments.sqlite3")
    history.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()
    if args.command == "serve":
        serve(args.host, args.port)
        return
    if args.command == "history":
        print(json.dumps(list_runs(args.database, args.limit), indent=2))
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
        result = evaluate_suite(model, args.max_steps, stress=args.stress)
        result["model"] = str(args.model)
        if not args.no_save:
            result["run_id"] = save_run(args.database, args.model, result)
            result["database"] = str(args.database)
        output = {key: value for key, value in result.items() if key != "cases"} if args.summary else result
        print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
