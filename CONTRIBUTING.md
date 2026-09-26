# Contributing

Thanks for improving RoadForge. Please open an issue before large architectural changes so the behavior and evaluation target are clear.

## Setup

```bash
python -m venv .venv
pip install -e ".[dev]"
pytest -q
ruff check src tests
node --check web/app.js
```

Keep Python engine behavior deterministic where possible. Add tests for changes to routing, observations, physics, learning, or the API. For model changes, report the seed, sample count, epoch count, arrival rate, and the exact map or route used. Do not describe a single-city result as real-world autonomous driving performance.

The browser intentionally uses plain JavaScript and no frontend build chain. Keep map edits validated by the Python server and preserve keyboard and small-screen usability.
