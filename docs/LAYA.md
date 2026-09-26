# Laya decision layer

RoadForge uses Laya only when the user submits a written mission brief. The core simulation and neural policy have no Laya dependency.

## Why this layer

[TypeSafe's Jev-style projects](https://github.com/TypeSafeAI/typesafe-playground) show a useful application pattern: supply state, ask typed questions, inspect probabilities, then let deterministic application code choose an action. [Laya's model card](https://huggingface.co/convaiinnovations/laya) documents the same `choice`, `score`, and `noul` family of typed decisions with a local Python runtime. In RoadForge, a mission brief is natural-language state; wheel steering is not.

The app asks:

1. **Choice:** is this a `cautious`, `standard`, or `unknown` driving mission?
2. **Score:** how much road-condition risk is described?

Only `cautious` and `standard` are accepted. Unknown or confidence below `0.65` falls back to cautious. The resulting speed cap is 10 or 19 simulation units per second. Laya never receives raw image frames, controls the vehicle directly, or changes the road graph.

## Install and use

```bash
pip install laya
roadforge serve
```

Enter a mission note in the sidebar and press **Analyze mission with Laya**. The first call can download a checkpoint. If Laya is unavailable, the app returns an explicit error while driving and training remain available.

## Verification status

Automated tests verify the adapter's decision mapping, question schema, and low-confidence fallback with a controlled Router stub. They do not assert a model-quality score. A real Laya inference run requires the optional package and checkpoint on the operator's machine. Threshold `0.65` is an application default, not a validated safety threshold.
