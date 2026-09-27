# Changelog

## Unreleased

- Added a paired 21-case preset benchmark, a 56-case generated-road stress mode, SQLite experiment history, and a synchronized browser replay.
- Replaced fixed-step road-edge rays with analytical intersections against the road capsules.
- Bound each HTTP server to its own app instance and validated JSON content type and browser Origin on writes.
- Updated the model card, architecture, README, and demo guidance to describe the simulation and results precisely.

## 0.1.0 — 2026-09-26

- Interactive canvas world editor with three presets, route selection, undo, and JSON import/export.
- Deterministic Python vehicle simulator, road-edge sensors, fleet telemetry, and collision detection.
- Trainable neural driver with committed reproducible weights and benchmark on three road layouts.
- Local HTTP API and optional Laya mission advisor with cautious fallback.
- Windows and Ubuntu unit checks, a Chromium browser workflow, and a container smoke test in GitHub Actions.
