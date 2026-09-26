# Local HTTP API

Run `roadforge serve` and use `http://127.0.0.1:8765`. JSON endpoints return either a result or `{ "error": "..." }` with a 4xx/5xx status. The server is intended for a trusted local user.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Liveness check |
| GET | `/api/state` | World, route, fleet, policy, training status |
| POST | `/api/world` | Validate and save `{world,start,goal}` |
| POST | `/api/route` | Select `{start,goal}` in the current graph |
| POST | `/api/fleet` | Reset with `{mode,count}` |
| POST | `/api/tick` | Advance `{frames}` fixed steps |
| POST | `/api/train` | Start `{epochs,samples,seed}` training job |
| POST | `/api/mission` | Laya decision for `{note}` |

### Example world

```json
{
  "world": {
    "nodes": {"a": {"x": 100, "y": 100}, "b": {"x": 300, "y": 100}},
    "roads": [{"a": "a", "b": "b"}],
    "width": 58
  },
  "start": "a",
  "goal": "b"
}
```

`POST /api/world` saves only after route validation succeeds. World limits: 2–250 nodes, 1–600 segments, road width 16–120, coordinate magnitude at most 10,000, and a 1 MB request body. `POST /api/train` accepts 1–80 epochs and 100–3,000 samples. `POST /api/tick` accepts 1–10 frames. Fleet size is 1–12.
