"""
Trains a baseline gradient-boosted model over log1p(steady_state_kwh),
evaluates against a held-out 20% of stations (a plain random split is a
station-level split here since build_training_frame returns one row per
station — no time-series leakage to worry about), compares against a dumb
district x location_class median baseline, registers the run in
`model_runs`, and saves the fitted artifact.

Not wired into a serving path yet — see the plan (Milestone A is offline
evaluation only).
"""

import json
import uuid
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import train_test_split

from app.db import get_connection
from app.features.build_features import build_training_frame

ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts"
MODEL_VERSION_PREFIX = "baseline_hgb"
MIN_TRAINING_STATIONS = 30


def _mape(y_true: np.ndarray, y_pred: np.ndarray) -> float | None:
    mask = y_true > 0
    if mask.sum() == 0:
        return None
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100)


def _score(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(mean_squared_error(y_true, y_pred) ** 0.5)
    mape = _mape(y_true, y_pred)
    return {
        "mae_kwh": round(mae, 1),
        "rmse_kwh": round(rmse, 1),
        "mape_pct": round(mape, 1) if mape is not None else None,
    }


def _baseline_predict(train_frame, test_frame) -> np.ndarray:
    group_median = train_frame.groupby(["district", "location_class"], observed=True)[
        "steady_state_kwh"
    ].median()
    global_median = train_frame["steady_state_kwh"].median()
    return np.array(
        [
            group_median.get((row["district"], row["location_class"]), global_median)
            for _, row in test_frame.iterrows()
        ]
    )


def run() -> dict:
    conn = get_connection()
    X, y = build_training_frame(conn)

    n = len(X)
    if n < MIN_TRAINING_STATIONS:
        conn.close()
        raise RuntimeError(
            f"Only {n} station(s) have >=6 months of real billing history — "
            f"need at least {MIN_TRAINING_STATIONS} to train a meaningful model."
        )

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    categorical_cols = [c for c in X.columns if str(X[c].dtype) == "category"]

    model = HistGradientBoostingRegressor(
        categorical_features=categorical_cols or None,
        random_state=42,
    )
    model.fit(X_train, np.log1p(y_train))

    pred = np.clip(np.expm1(model.predict(X_test)), 0, None)
    model_metrics = _score(y_test.to_numpy(), pred)

    train_frame = X_train.assign(steady_state_kwh=y_train)
    test_frame = X_test.assign(steady_state_kwh=y_test)
    baseline_pred = _baseline_predict(train_frame, test_frame)
    baseline_metrics = _score(y_test.to_numpy(), baseline_pred)

    metrics = {
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "model": model_metrics,
        "baseline_district_locationclass_median": baseline_metrics,
    }

    model_version = f"{MODEL_VERSION_PREFIX}_{uuid.uuid4().hex[:8]}"
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    artifact_path = ARTIFACT_DIR / f"{model_version}.joblib"
    joblib.dump(
        {"model": model, "feature_columns": list(X.columns), "categorical_columns": categorical_cols},
        artifact_path,
    )

    with conn.cursor() as cur:
        cur.execute(
            """
            insert into model_runs (model_version, algorithm, training_window, metrics, is_active)
            values (%s, %s, %s, %s, false)
            returning id
            """,
            (
                model_version,
                "HistGradientBoostingRegressor(log1p target)",
                json.dumps(
                    {
                        "n_stations_total": n,
                        "min_mature_months": 6,
                        "steady_state_window": 3,
                    }
                ),
                json.dumps(metrics),
            ),
        )
        run_id = cur.fetchone()[0]
    conn.commit()
    conn.close()

    print(f"model_runs id: {run_id}, model_version: {model_version}")
    print(f"Artifact saved: {artifact_path}")
    print(json.dumps(metrics, indent=2))
    return metrics


if __name__ == "__main__":
    run()
