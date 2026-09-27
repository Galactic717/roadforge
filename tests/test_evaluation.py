import json
import sqlite3
import sys
from pathlib import Path

import pytest

from roadforge import cli
from roadforge.evaluation import evaluate_suite, generated_stress_world, list_runs, model_sha256, save_run
from roadforge.learning import Network


def test_paired_suite_and_sqlite_experiment_transaction(tmp_path: Path):
    model_path = Path(__file__).resolve().parents[1] / "data" / "pretrained_model.json"
    result = evaluate_suite(Network.load(model_path))
    assert result["summary"]["reference"]["total"] == 21
    assert result["summary"]["learned"]["total"] == 21
    for reference, learned in zip(result["cases"][::2], result["cases"][1::2], strict=True):
        assert reference["policy"] == "reference" and learned["policy"] == "learned"
        assert reference["world"] == learned["world"]
        assert reference["start"] == learned["start"]
        assert reference["initial_speed"] == learned["initial_speed"]

    database = tmp_path / "experiments.sqlite3"
    run_id = save_run(database, model_path, result)
    assert run_id == 1
    assert list_runs(database)[0]["model_sha256"] == model_sha256(model_path)
    assert list_runs(database)[0]["learned_arrivals"] == result["summary"]["learned"]["arrivals"]
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT COUNT(*) FROM cases WHERE run_id = ?", (run_id,)).fetchone()[0] == 42

    duplicate = {**result, "cases": result["cases"] + result["cases"][:1]}
    with pytest.raises(sqlite3.IntegrityError):
        save_run(database, model_path, duplicate)
    assert len(list_runs(database)) == 1


def test_benchmark_summary_cli_omits_case_rows(monkeypatch, capsys):
    monkeypatch.setattr(
        cli,
        "evaluate_suite",
        lambda _model, _max_steps, stress: {
            "suite_version": 1,
            "summary": {"learned": {"arrivals": 1}},
            "cases": [{}],
        },
    )
    monkeypatch.setattr(
        sys,
        "argv",
        ["roadforge", "benchmark", "--model", "data/pretrained_model.json", "--no-save", "--summary"],
    )
    cli.main()
    result = json.loads(capsys.readouterr().out)
    assert result["summary"]["learned"]["arrivals"] == 1
    assert "cases" not in result


def test_generated_stress_world_is_reproducible_and_uses_valid_route():
    first, start, goal = generated_stress_world(11)
    second, _, _ = generated_stress_world(11)
    assert first.to_dict() == second.to_dict()
    assert first.route(start, goal) == [f"g{i}" for i in range(8)]
    assert 36 <= first.width <= 60


def test_stress_suite_keeps_reference_and_learned_quality():
    model_path = Path(__file__).resolve().parents[1] / "data" / "pretrained_model.json"
    result = evaluate_suite(Network.load(model_path), stress=True)
    assert result["summary"]["reference"] == {
        "arrivals": 56,
        "total": 56,
        "mean_completion": pytest.approx(0.9949),
    }
    assert result["summary"]["learned"]["total"] == 56
    assert result["summary"]["learned"]["arrivals"] >= 53
