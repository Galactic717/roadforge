import sys
from types import SimpleNamespace

import pytest

from roadforge.mission import _router, classify_mission


def test_laya_decision_and_low_confidence_fallback(monkeypatch):
    class Router:
        def predict(self, note, questions):
            assert "mode" in questions and "risk" in questions
            return {
                "answers": {"mode": {"choice": "standard", "probabilities": {"standard": 0.92}}, "risk": {"score": 0.2}}
            }

    monkeypatch.setitem(sys.modules, "laya", SimpleNamespace(Router=Router))
    _router.cache_clear()
    decision = classify_mission("Normal city drive with clear roads")
    assert decision["mode"] == "standard" and decision["speed_cap"] == 19

    class UnsureRouter:
        def predict(self, note, questions):
            return {"answers": {"mode": {"choice": "standard", "confidence": 0.3}, "risk": {}}}

    monkeypatch.setitem(sys.modules, "laya", SimpleNamespace(Router=UnsureRouter))
    _router.cache_clear()
    assert classify_mission("Maybe drive carefully")["mode"] == "cautious"
    _router.cache_clear()


def test_mission_length_is_bounded():
    with pytest.raises(ValueError):
        classify_mission("x" * 1201)
