# Architecture

RoadForge has one authoritative Python engine and a thin canvas client.

## Data model

`World` stores named 2D nodes, undirected road segments, and a shared road width. It rejects invalid coordinates, missing endpoints, duplicate or too-short segments, and oversized maps. The editor sends a complete world document to `POST /api/world`; the server validates it before replacing the active world.

`World.route()` runs Dijkstra over Euclidean road lengths. The selected path becomes a `Route` with cumulative distances. A car projects its position onto segments to track monotonic route progress. Editing can change the optimal route, so existing neural weights are tied to a world/route key and disabled when the topology changes.

## Simulation

The engine advances in fixed `0.1 s` steps. Each car stores position, heading, speed, progress, and terminal state. Steering rotates the car based on speed; throttle accelerates against constant and speed-dependent drag. Leaving the road, colliding with another active car, arriving, or reaching the evaluation time limit ends a run. The model is deliberately simple and deterministic so behavior is inspectable and tests are reproducible.

Observations contain: target-heading error, route-tangent error, normalized speed, and five normalized ray distances to road edges. The rays look at `−1.1`, `−0.5`, `0`, `0.5`, and `1.1` radians relative to the car. The reference driver steers toward a point 42 units ahead and adjusts throttle for turn severity. It is the teacher, not part of the learned policy at inference time.

## Training

The neural network has 8 inputs, 12 tanh hidden units, and 2 tanh outputs. Output one is steering in `[-1, 1]`; output two maps to throttle in `[0, 1]`. A seeded sampler perturbs pose and speed along the current route and asks the reference driver for actions. Online stochastic gradient descent with backpropagation minimizes squared action error. Each training run stores loss per epoch, reference completion, learned completion, seed, sample count, and epoch count. The server trains on a background thread and exposes progress through `/api/state`.

The first release implements behavioral cloning, not reinforcement learning. Its claims are limited to the included 2D simulation. The architecture intentionally keeps policy observation and physics behind small Python interfaces so future work can add traffic rules, dynamic obstacles, stronger dynamics, curriculum training, and held-out world evaluations.

## Local decision layer

`mission.py` optionally loads Laya on a mission request, classifies the user-written note, and returns a typed mode, risk score, and confidence. Confidence below `0.65` selects cautious mode. The final speed cap is applied in the simulation loop, independently of network steering. This is a workflow-level decision, modeled after the choice/score pattern seen in typed decision systems such as Jev. See [LAYA.md](LAYA.md).

## Boundaries

- The HTTP server defaults to `127.0.0.1` and serves a fixed allowlist of three web assets.
- The JSON API limits each request body to 1 MB; world sizes and training parameters are bounded.
- Roads, routes, models, and mission outputs are validated before use.
- There is no claim of multiuser isolation or safe exposure to untrusted networks. Run locally.
