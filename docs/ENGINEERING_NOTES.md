# Engineering notes

These notes describe the implemented system and the questions its design raises. They are intended to make the project easy to review and explain.

## Vehicle model and geometry

A car is a point with position, heading, and scalar speed. At each fixed 0.1-second step, throttle contributes acceleration, constant and speed-dependent drag reduce it, and steering changes heading at a speed-dependent rate. Position advances along the new heading. There is no wheelbase, slip angle, tire force, or differential steering. Calling this a bicycle model would be inaccurate.

A road is the Minkowski sum of a line segment and a circle of radius half the road width: a capsule. Each sensor ray is intersected analytically with a strip and the two endpoint circles for every road. The resulting ray intervals are merged; the sensor returns the first exit from the connected road union, capped at 90 simulation units. This avoids the 5-unit quantization of the initial ray marcher. The exactness is geometric within this simplified road representation; it does not introduce realistic sensors.

Route progress projects the point car onto route segments and keeps progress monotonic. This supports a visual progress display, but at self-crossings or close parallel segments it may choose an unintended segment. Arrival also requires proximity to the destination, so progress alone is not the success criterion.

## Why the policy is small

The MLP has 8 × 12 + 12 + 12 × 2 + 2 = **134 parameters**. Five inputs are road-edge distances; the other three are target-heading error, route-tangent error, and normalized speed. Tanh produces steering; the second output is mapped from [-1, 1] to throttle in [0, 1]. The target actions come from a proportional route-following controller. Training uses squared action error and online SGD with manually implemented backpropagation.

This is a deliberately inspectable behavioral-cloning example. A framework would be appropriate for larger experiments, data pipelines, batching, hardware acceleration, and model comparison. Hand-written backprop here shows the gradient path but is not itself evidence of production ML experience.

Action MSE answers how closely the student matches teacher actions on sampled states. It does not measure arrival, collisions, or resilience. The student can enter states absent from its training distribution; its errors can then compound (**covariate shift**). Sampling lateral and heading perturbations reduces some exposure, but this project does not perform DAgger or collect teacher corrections on student trajectories.

## Evaluation contract

The default benchmark has 3 hand-built maps × 7 initial states = 21 paired scenarios. The optional stress mode adds five seeded narrow-road chains with right-angle turns, for 56 paired scenarios. Each policy receives the exact same starting position, heading, speed, route, and step limit. Results include arrival, route completion, tick count, and terminal reason. The committed model reaches 21/21 on the presets but 53/56 in stress mode, while the reference reaches 56/56. The result is a deterministic regression check, not a confidence interval or an untouched real-world test. The city was used in training. All other maps still share the same observation design and simulator rules.

The benchmark records runs and individual cases in SQLite in one transaction. The stored SHA-256 identifies the model bytes, and the suite version identifies the scenario set. A failed case insert rolls back the whole run. This is a small local experiment ledger, not a multiuser service.

## Application tradeoffs

The HTTP server uses the Python standard library to keep installation simple. An app instance is bound to each server instead of a global handler class. Requests have size and parameter limits; mutating requests require JSON and reject a foreign browser Origin. There is no authentication, authorization, or production deployment claim. A public service would need a different threat model and likely a framework, database migrations, structured logging, and deployment controls.

The canvas UI is one plain JavaScript file. That keeps the local demo easy to run, but the file should be split into modules if interactions grow. The paired replay is computed server-side from the current route and model and then animated client-side. It is a visualization of two deterministic runs, not live AI inference in the browser.

The optional Laya adapter is only a mission-note classifier that chooses a speed cap. Its automated tests stub the external router. A small local smoke check is documented in [LAYA.md](LAYA.md), but no calibrated model-quality result is claimed.

## Interview walkthrough

Be prepared to reproduce a small part of the project without looking at generated code: explain Dijkstra's invariant, walk through one HTTP request and validation path, derive an output-layer gradient, and explain what the 21/21 figure does and does not show. Describe any AI assistance according to what actually happened during development. The tightly spaced first commits are publication timestamps; they are not evidence of elapsed implementation time.
