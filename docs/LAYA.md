# Laya decision layer

RoadForge uses Laya only when the user submits a written mission brief. The core simulation and neural policy have no Laya dependency.

## Why this layer

[TypeSafe's Jev-style projects](https://github.com/TypeSafeAI/typesafe-playground) show a useful application pattern: supply state, ask typed questions, inspect probabilities, then let deterministic application code choose an action. [Laya's model card](https://huggingface.co/convaiinnovations/laya) documents the same `choice`, `score`, and `noul` family of typed decisions with a local Python runtime. In RoadForge, a mission brief is natural-language state; wheel steering is not.

The app asks:

1. **Choice:** is this a `cautious`, `standard`, or `unknown` driving mission?
2. **Score:** how much road-condition risk is described?

Only `cautious` and `standard` are accepted. Unknown or a model score below `0.65` falls back to cautious. The resulting speed cap is 10 or 19 simulation units per second. Laya never receives raw image frames, controls the vehicle directly, or changes the road graph.

## Install and use

```bash
pip install laya
roadforge serve
```

Enter a mission note in the sidebar and press **Analyze mission with Laya**. The first call can download a checkpoint. If Laya is unavailable, the app returns an explicit error while driving and training remain available.

## Verification status

Automated tests verify the adapter's decision mapping, question schema, and low-score fallback with a controlled Router stub. On 26 September 2026, Laya `0.3.20` was also run locally with the example fog and clear-road notes; it returned cautious and standard respectively. The runtime warned that some checkpoint temperatures were invalid and affected scores should be treated as **uncalibrated**. RoadForge labels the field `calibration: "unverified"` and treats `0.65` as an application heuristic, not a validated safety threshold. Neither the example calls nor the tests establish model-quality performance.
