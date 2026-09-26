"""Optional local Laya decision layer for a written driving mission.

The output changes the simulation's speed policy only. It never directly
steers a car and cannot override geometric road boundaries.
"""

from __future__ import annotations


def classify_mission(note: str) -> dict:
    if not 1 <= len(note.strip()) <= 1200:
        raise ValueError("mission note must contain 1–1200 characters")
    try:
        from laya import Router  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError("Laya is not installed; run `pip install laya` to enable local mission decisions") from exc

    router = Router()
    questions = {
        "mode": {"type": "choice", "instructions": "Choose the driving mission mode from the note.",
                 "criteria": {"cautious": "Requests slow or cautious driving, e.g. school zone, fog, ice, pedestrians",
                              "standard": "Normal driving without a special speed instruction",
                              "unknown": "The note is unrelated to driving or is too ambiguous to classify"}},
        "risk": {"type": "score", "instructions": "Rate the stated road-condition risk.",
                 "criteria": ["No unusual road risk", "Some caution is needed", "Severe road risk"]},
    }
    result = router.predict(note, questions)
    mode_answer = result["answers"]["mode"]
    mode = mode_answer.get("choice", "unknown")
    probabilities = mode_answer.get("probabilities", {})
    confidence = probabilities.get(mode, mode_answer.get("confidence", 0.0))
    try:
        confidence = float(confidence)
    except (TypeError, ValueError):
        confidence = 0.0
    if mode not in ("cautious", "standard") or confidence < 0.65:
        mode = "cautious"  # safe deterministic fallback for ambiguous text
    return {"provider": "laya", "mode": mode, "confidence": round(confidence, 3),
            "risk": result["answers"].get("risk", {}).get("score"), "speed_cap": 10 if mode == "cautious" else 19}
