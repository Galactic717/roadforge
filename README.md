# RoadForge

**A local 2D road editor and imitation-learning sandbox.** Draw a graph, select a route, and compare a geometric controller with a small learned policy in a deterministic simulation.

![RoadForge editor and fleet view](docs/screenshot.png)

[Paired policy replay](docs/comparison.png) · [Switchback preview](docs/switchback.png) · [Mobile layout](docs/mobile.png)

RoadForge is a portfolio project for Python simulation, API design, testing, and reproducible model evaluation. It is not a vehicle controller or a claim of autonomous-driving safety. The trained network has 8 inputs, 12 hidden units, and 2 outputs; it imitates a route-following controller on synthetic states. The optional [Laya adapter](docs/LAYA.md) classifies a written mission note and adjusts a speed cap when its separately installed package is available.

## Run it

Python 3.11+ is required. The base app has no runtime dependencies.

```bash
git clone https://github.com/Galactic717/roadforge.git
cd roadforge
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -e .
roadforge serve
```

Open <http://127.0.0.1:8765>. The editor can draw and erase roads, select a shortest path, import/export a world, train a policy on the selected route, and display fleet telemetry. **Compare replay** draws the reference and learned trips on the same map with synchronized time and separate traces. The server binds to localhost by default. Set `ROADFORGE_DATA_DIR` to move local worlds, weights, and experiment records. A local Docker run is supported: `docker build -t roadforge .` then `docker run --rm -p 127.0.0.1:8765:8765 roadforge`.

## Reproduce an experiment

```bash
roadforge evaluate --model data/pretrained_model.json
roadforge benchmark --model data/pretrained_model.json --summary
roadforge benchmark --model data/pretrained_model.json --stress --summary --no-save
roadforge history
roadforge train --seed 7 --samples 1100 --epochs 24 --output data/model.json
```

`evaluate` runs one nominal trip on the bundled city. `benchmark` runs **paired, closed-loop** reference and learned-policy trips from the same 21 initial states across city, switchback, and zigzag layouts. States include lateral displacement, heading error, and nonzero initial speed. `--stress` adds five seeded, generated narrow-road layouts for 56 paired scenarios total. Its JSON contains every outcome and an aggregate. By default, it saves the model SHA-256, run metadata, and per-case results in a local SQLite database (`data/experiments.sqlite3`). Use `--summary` to print only aggregates, `--no-save` for a read-only run, `--database PATH` for another database, or `--max-steps N` to change the time limit. `history` lists saved runs.

With the committed weights, both policies arrive in **21/21** preset cases. On the expanded stress suite, the reference arrives in **56/56** and the learned policy in **53/56**; the three learned failures leave the road on narrow generated layouts. Arrival occurs before the exact endpoint. The suites are deterministic checks on synthetic maps, not estimates for arbitrary roads, traffic, physical vehicles, or production ML workloads. The learned policy approximately reproduces a strong teacher on the easy cases, while the stress cases expose a gap. See the [model card](docs/MODEL_CARD.md) for the protocol and limitations.

## What is implemented

- Validated road graph and Dijkstra shortest-path routing.
- Fixed-step point-vehicle simulation with speed, heading, road-exit, arrival, and fleet collision rules. This is **not** a bicycle or tire model.
- Analytical ray-to-road-boundary distances for the union of constant-width road capsules.
- A hand-written 8–12–2 tanh network trained by behavioral cloning with squared action error and stochastic gradient descent. Inference uses only learned weights.
- A local JSON API, bounded inputs, background training, atomic JSON files, and SQLite experiment records.
- A plain JavaScript canvas editor and paired-policy replay. No React or frontend build pipeline is claimed.

The network is intentionally small and dependency-free so its training path is inspectable. PyTorch, authentication, multiuser operation, dynamic traffic, and realistic vehicle dynamics are outside this version. The optional mission adapter is an integration experiment; its automated tests stub the external model. [Architecture](docs/ARCHITECTURE.md), [API](docs/API.md), and [engineering notes](docs/ENGINEERING_NOTES.md) explain design choices and tradeoffs.

## Development

```bash
pip install -e ".[dev]"
pytest -q
ruff check src tests e2e
ruff format --check src tests e2e
node --check web/app.js
```

For the browser workflow, install `.[e2e]`, run `python -m playwright install chromium`, then `pytest e2e -q`. GitHub Actions runs Python tests on Windows and Ubuntu, Ruff, a Chromium workflow, and a Docker smoke check. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## Project layout

```text
src/roadforge/   Simulation, learning, evaluation, SQLite records, and HTTP API
web/             Canvas UI
data/            Committed example weights and ignored local state
tests/, e2e/     Unit, HTTP, database, and browser tests
docs/            Architecture, API, model card, and engineering notes
```

## Provenance and presentation

The project was inspired by building a virtual road world in plain JavaScript; the simulation engine is Python. [Google ARTEMIS](https://github.com/google/artemis) informed the emphasis on documentation and verification, and [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) informed the explorable visualization. No code or media was copied from those projects. Laya is separately installed and its weights are not bundled. The first public Git commits are closely spaced; they should not be read as elapsed implementation time for each subsystem. Project claims should be checked with the code and reproducible commands.

For a short demo or interview walkthrough, see the [presentation guide](docs/DEMO.md).

MIT license; see [LICENSE](LICENSE).
