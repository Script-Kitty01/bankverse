"""BankVerse Phase 4 training pipeline.

Runs the full ML milestone:

1. Load the canonical attempt dataset (data/ml_dataset.csv).
2. Build causal, strictly-prior features (ml.features).
3. Verify the causal guard (no future leakage).
4. Time-based train / validation / hold-out split by provider.
5. Train a logistic regression interpretable baseline and an XGBoost
   failure-prediction candidate.
6. Calibrate probabilities (sigmoid) on validation; pick the cost-optimal
   operating threshold on validation.
7. Evaluate both models on the hold-out split (ROC-AUC, PR-AUC, ECE,
   precision/recall at threshold, expected cost).
8. Train a recovery-outcome model (multi-class) for bounded actions.
9. Emit SHAP summaries from the evaluation split.
10. Persist versioned artifacts + a durable registry pointer.

Command::

    python ml/train.py --data data/ml_dataset.csv --seed 42

No model in this pipeline ever moves money; outputs are advisory models that
Phase 5 (FastAPI/ML router) will consume under policy validation.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Ensure the project root is importable when this file is run directly
# (python ml/train.py puts ml/ on sys.path, not the repo root).
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import roc_auc_score
from xgboost import XGBClassifier

from ml.evaluate import (
    CostModel,
    full_metrics,
    save_report,
    select_cost_optimal_threshold,
    shap_summary,
)
from ml.features import FEATURE_COLUMNS, build_features, verify_causality
from ml.registry import MODELS_DIR, register, write_model

DEFAULT_DATA = ROOT / "data" / "ml_dataset.csv"
REPORTS_DIR = MODELS_DIR.parent / "reports"

# Model versions bump only when these contracts change.
FEATURE_SCHEMA_VERSION = 1
MODEL_VERSION_PREFIX = "bv-failure-"
RECOVERY_VERSION_PREFIX = "bv-recovery-"


def dataset_hash(path: Path) -> str:
    """SHA-256 of the raw training file used for provenance."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def time_split(
    frame: pd.DataFrame,
    *,
    train_frac: float = 0.7,
    valid_frac: float = 0.15,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Strictly chronological provider-wise split.

    For every provider, the first train_frac of attempts are training, the next
    valid_frac are validation, and the remaining are hold-out. This preserves
    the causal ordering the features assume and prevents future leakage into
    earlier decisions.
    """
    train: list[pd.DataFrame] = []
    valid: list[pd.DataFrame] = []
    test: list[pd.DataFrame] = []

    for _, group in frame.sort_values("timestamp").groupby("provider", sort=False):
        group = group.sort_values("timestamp").reset_index(drop=True)
        count = len(group)
        n_train = int(count * train_frac)
        n_valid = int(count * valid_frac)
        train.append(group.iloc[:n_train])
        valid.append(group.iloc[n_train : n_train + n_valid])
        test.append(group.iloc[n_train + n_valid :])

    return (
        pd.concat(train, ignore_index=True),
        pd.concat(valid, ignore_index=True),
        pd.concat(test, ignore_index=True),
    )


from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


def train_failure_models(
    x_train: pd.DataFrame,
    y_train: pd.Series,
    seed: int,
) -> tuple[CalibratedClassifierCV, CalibratedClassifierCV]:
    """Train the logistic baseline and XGBoost candidate (sigmoid calibrated).

    Returns (baseline, candidate). Both probability outputs are used only for
    advisory routing; neither ever moves money.
    """
    baseline = CalibratedClassifierCV(
        make_pipeline(
            StandardScaler(),
            LogisticRegression(
                max_iter=2000, class_weight="balanced", random_state=seed
            ),
        ),
        method="sigmoid",
        cv=3,
    )
    baseline.fit(x_train, y_train)

    candidate = CalibratedClassifierCV(
        XGBClassifier(
            n_estimators=400,
            max_depth=5,
            learning_rate=0.03,
            subsample=0.9,
            colsample_bytree=0.8,
            eval_metric="logloss",
            random_state=seed,
            n_jobs=-1,
        ),
        method="sigmoid",
        cv=3,
    )
    candidate.fit(x_train, y_train)
    return baseline, candidate


from sklearn.preprocessing import LabelEncoder


def train_recovery_model(
    x_attempt: pd.DataFrame,
    y_action: pd.Series,
    seed: int,
) -> tuple[XGBClassifier, LabelEncoder]:
    """Train a recovery-action classifier over bounded recovery actions.

    Uses only failed attempts (labels NONE/RETRY/SWITCH/WAIT). This model is
    advisory only; the policy engine decides whether any recovery action may
    execute.
    """
    encoder = LabelEncoder()
    y_encoded = encoder.fit_transform(y_action)

    model = XGBClassifier(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        eval_metric="mlogloss",
        random_state=seed,
        n_jobs=-1,
    )
    model.fit(x_attempt, y_encoded)
    return model, encoder
def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data",
        type=Path,
        default=DEFAULT_DATA,
        help="Path to the canonical ML dataset CSV.",
    )
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    hash_hex = dataset_hash(args.data)
    print(f"[train] Dataset: {args.data} | sha256={hash_hex[:16]}...")

    frame = pd.read_csv(args.data)
    frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True)
    print(f"[train] Loaded {len(frame)} rows, sources={frame['source'].nunique()}")

    # 1. Features (strictly causal).
    print("[train] Building causal features...")
    features = build_features(frame)
    if len(features) != len(frame):
        raise RuntimeError("Feature builder changed the row count; aborting.")
    print(f"[train] Built {features.shape[1]} features")

    # 2. Causality guard (loud, fails on leakage).
    print("[train] Verifying causal guard (no future leakage)...")
    verify_causality(frame, features)
    print("[train] Causality guard passed.")

    merged = frame.join(features).dropna(subset=FEATURE_COLUMNS)

    # 3. Chronological provider-wise split.
    train_frame, valid_frame, test_frame = time_split(merged)
    print(
        f"[train] Split: train={len(train_frame)} valid={len(valid_frame)} "
        f"test={len(test_frame)}"
    )

    x_train = train_frame[FEATURE_COLUMNS].fillna(-1.0)
    x_valid = valid_frame[FEATURE_COLUMNS].fillna(-1.0)
    x_test = test_frame[FEATURE_COLUMNS].fillna(-1.0)
    y_train = train_frame["failure"].astype(int)
    y_valid = valid_frame["failure"].astype(int)
    y_test = test_frame["failure"].astype(int)

    start_time = time.time()

    # 4. Train failure models (baseline + candidate).
    baseline, candidate = train_failure_models(x_train, y_train, args.seed)
    print("[train] Failure models trained.")

    # 5. Cost-optimal thresholds on validation.
    cost_model = CostModel()
    base_probs_valid = baseline.predict_proba(x_valid)[:, 1]
    cand_probs_valid = candidate.predict_proba(x_valid)[:, 1]
    base_threshold = select_cost_optimal_threshold(
        y_valid, pd.Series(base_probs_valid), valid_frame["amount"]
    )
    cand_threshold = select_cost_optimal_threshold(
        y_valid, pd.Series(cand_probs_valid), valid_frame["amount"]
    )

    # 6. Evaluate on the untouched hold-out split.
    base_probs_test = baseline.predict_proba(x_test)[:, 1]
    cand_probs_test = candidate.predict_proba(x_test)[:, 1]

    baseline_report = full_metrics(
        y_test,
        pd.Series(base_probs_test),
        test_frame["amount"],
        threshold=base_threshold["threshold"],
    )
    candidate_report = full_metrics(
        y_test,
        pd.Series(cand_probs_test),
        test_frame["amount"],
        threshold=cand_threshold["threshold"],
    )

    print(
        f"[eval] baseline  ROC-AUC={baseline_report['roc_auc']:.3f} "
        f"PR-AUC={baseline_report['pr_auc']:.3f} "
        f"ECE={baseline_report['calibration_error_ece']:.4f}"
    )
    print(
        f"[eval] candidate ROC-AUC={candidate_report['roc_auc']:.3f} "
        f"PR-AUC={candidate_report['pr_auc']:.3f} "
        f"ECE={candidate_report['calibration_error_ece']:.4f}"
    )

    # 7. SHAP summary on the evaluation split (candidate only).
    print("[train] Computing SHAP summary...")
    shap_importances = shap_summary(candidate, x_test)

    # 8. Recovery model on failed attempts.
    failed = merged[merged["failure"] == 1]
    print(f"[train] Recovery model on {len(failed)} failed attempts...")
    recovery_x = failed[FEATURE_COLUMNS].fillna(-1.0)
    recovery_y = failed["recovery_action"].astype(str)
    recovery_model, recovery_encoder = train_recovery_model(recovery_x, recovery_y, args.seed)

    # 9. Persist artifacts + registry pointer.
    version = f"{datetime.now(timezone.utc):%Y%m%dT%H%M%S}"
    write_model(baseline, f"failure_baseline_{version}.joblib")
    write_model(candidate, f"failure_candidate_{version}.joblib")
    write_model({"model": recovery_model, "encoder": recovery_encoder}, f"recovery_{version}.joblib")

    register(
        model_version=MODEL_VERSION_PREFIX + version,
        model_type="xgboost",
        task="failure",
        trained_at=datetime.now(timezone.utc).isoformat(),
        training_start=str(train_frame["timestamp"].min()),
        training_end=str(train_frame["timestamp"].max()),
        dataset_hash=hash_hex,
        feature_schema_version=FEATURE_SCHEMA_VERSION,
        artifact_path=f"failure_candidate_{version}.joblib",
        metrics=candidate_report,
        status="candidate",
        notes="Phase 4 XGBoost failure candidate; SHADOW routing only.",
    )
    register(
        model_version="bv-baseline-" + version,
        model_type="logistic",
        task="failure",
        trained_at=datetime.now(timezone.utc).isoformat(),
        training_start=str(train_frame["timestamp"].min()),
        training_end=str(train_frame["timestamp"].max()),
        dataset_hash=hash_hex,
        feature_schema_version=FEATURE_SCHEMA_VERSION,
        artifact_path=f"failure_baseline_{version}.joblib",
        metrics=baseline_report,
        status="candidate",
        notes="Phase 4 logistic baseline.",
    )
    register(
        model_version=RECOVERY_VERSION_PREFIX + version,
        model_type="xgboost",
        task="recovery",
        trained_at=datetime.now(timezone.utc).isoformat(),
        training_start=str(train_frame["timestamp"].min()),
        training_end=str(train_frame["timestamp"].max()),
        dataset_hash=hash_hex,
        feature_schema_version=FEATURE_SCHEMA_VERSION,
        artifact_path=f"recovery_{version}.joblib",
        metrics={"num_trained": int(len(recovery_x))},
        status="candidate",
        notes="Phase 4 recovery-action advisory model.",
    )
    baseline_report = full_metrics(
        y_test,
        pd.Series(base_probs_test),
        test_frame["amount"],
        threshold=base_threshold["threshold"],
    )
    candidate_report = full_metrics(
        y_test,
        pd.Series(cand_probs_test),
        test_frame["amount"],
        threshold=cand_threshold["threshold"],
    )
# 10. Reports.
    reports = {
        "baseline": baseline_report,
        "candidate": candidate_report,
        "thresholds": {
            "baseline": base_threshold,
            "candidate": cand_threshold,
        },
        "validation_roc_auc": {
            "baseline": float(roc_auc_score(y_valid, base_probs_valid)),
            "candidate": float(roc_auc_score(y_valid, cand_probs_valid)),
        },
        "shap_importances": shap_importances,
        "dataset_hash": hash_hex,
        "num_train": len(train_frame),
        "num_valid": len(valid_frame),
        "num_test": len(test_frame),
        "model_versions": {
            "baseline": "bv-baseline-" + version,
            "candidate": MODEL_VERSION_PREFIX + version,
            "recovery": RECOVERY_VERSION_PREFIX + version,
        },
        "runtime_seconds": round(time.time() - start_time, 2),
        "disclosure": "Synthetic/hybrid seeded evaluation; not production performance claims.",
    }
    save_report(reports, REPORTS_DIR / f"report_{version}.json")
    print(f"[train] Report written to ml/reports/report_{version}.json")
    print(f"[train] Done ({reports['runtime_seconds']}s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
