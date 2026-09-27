# Demo and publishing guide

This is a recording plan, not a claim about results outside the included simulator. Show the running application and a terminal benchmark from the same revision. Use actual screen capture; do not label a rendered replay as a live road test.

## 30-second vertical clip (TikTok / Shorts / Reels)

Record at 1080 × 1920. Keep the map and replay HUD visible; use the browser's narrow layout or crop the desktop capture around the canvas.

| Time | Picture | Spoken line or caption |
| --- | --- | --- |
| 0–3 s | Start on the road editor, cursor over the map | “I built a tiny 2D road simulator in Python.” |
| 3–8 s | Draw or erase a road, then select a route | “You can edit the road graph and choose a destination.” |
| 8–15 s | Train with 8 epochs and 300 samples; show the loss chart | “A 134-parameter network learns to imitate a simple route follower.” |
| 15–26 s | Press **Compare replay**; keep blue and lime traces in frame | “Here are the reference and learned policies from the same start.” |
| 26–30 s | Show two terminal summaries: 21/21 preset, then 53/56 learned stress | “Narrow generated roads expose three failures. Code and limits are on GitHub.” |

Suggested on-screen legend: **Blue: reference controller · Lime: learned policy · 2D simulation**. Do not substitute “self-driving AI” or “99.4% accuracy” for these terms; route completion is not classification accuracy.

## X post

> Built RoadForge: a local 2D road editor + Python imitation-learning sandbox. Draw a route, train a 134-parameter policy, then replay it beside its geometric teacher. Both policies reach 21/21 on preset cases. On 56 paired stress cases with narrower generated roads, the teacher reaches 56/56 and the learned policy 53/56. The failures are part of the demo. Code, tests, SQLite records, and limits: https://github.com/Galactic717/roadforge

Attach a 15–25-second screen capture of **Compare replay**. A useful second post can show one engineering detail: the exact ray/capsule intersection or the paired benchmark JSON, with a link to the relevant source file. Avoid claims that the suite validates autonomous driving.

## YouTube walkthrough (3–5 minutes)

1. **0:00–0:25 — The scope.** “This is a 2D simulation and imitation-learning exercise, not a car controller.” Show the editor.
2. **0:25–1:15 — Build a world.** Load switchback, draw a connection, set a route. Mention Dijkstra and world validation.
3. **1:15–2:00 — The two policies.** Show the proportional reference controller and the 8–12–2 network. Explain that behavioral cloning predicts the teacher's steering and throttle.
4. **2:00–2:45 — Compare replay.** Pause the fleet, press the replay button, and narrate the synchronized traces.
5. **2:45–3:35 — Evidence.** Run `roadforge benchmark --model data/pretrained_model.json --summary` and then `roadforge benchmark --model data/pretrained_model.json --stress --summary`. Point to the learned policy's three failures and a SQLite model hash. Show one detailed case from a full JSON run if explaining terminal reasons.
6. **3:35–4:30 — Limits and next experiment.** The routes are hand-built, the teacher is simple, and a 21/21 result on this suite does not establish generalization. A next step would be new maps and student-visited states with teacher corrections.

## Before posting

Run `pytest -q`, `node --check web/app.js`, and both preset and `--stress` benchmarks with `--no-save --summary`. Make sure captions match those runs. Keep the optional Laya feature out of the short clip unless it is actually installed and running; its test stub is not a model-quality demonstration. If AI tools helped build the repo, describe their role honestly in the video or interview. The strongest claim you can make is that you understand, test, and can extend the code you publish.
