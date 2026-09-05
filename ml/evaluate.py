"""Honest model evaluation utilities for the BankVerse ML pipeline.

Implements the plan-telemetry Phase 4 evaluation contract:

- ROC-AUC and PR-AUC,
- Brier score and calibration curve error (ECE),
- precision/recall at a cost-optimal operating threshold,
- expected cost model (failure exposure, provider cost, latency penalty),
- confusion matrix and false-positive rate,
- SHAP summary computation (only from the evaluation split).
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

# Default cost model (documented, tunable, defense-only).
DEFAULT_FAILURE_FRACTION = 0.02  # share of value lost on a failed attempt
DEFAULT_PROVIDER_COST = 1.20  # avg per-transaction provider fee (INR)
DEFAULT_LATENCY_PENALTY_PER_MS = 0.002  # INR per ms of customer impact


class CostModel:
    """Expected-cost model used only as a routing decision aid.

    expected_cost = failure_cost + provider_cost + latency_penalty
    The model never mutates funds; it only scores candidate decisions.
    """

    def __init__(
        self,
        failure_fraction: float = DEFAULT_FAILURE_FRACTION,
        provider_cost: float = DEFAULT_PROVIDER_COST,
        latency_penalty_per_ms: float = DEFAULT_LATENCY_PENALTY_PER_MS,
    ) -> None:
        self.failure_fraction = failure_fraction
        self.provider_cost = provider_cost
        self.latency_penalty_per_ms = latency_penalty_per_ms

    def expected_cost(
        self,
        amount: float,
        failure_probability: float,
        latency_ms: float,
    ) -> float:
        failure_cost = failure_probability * amount * self.failure_fraction
        provider_cost = self.provider_cost
        latency_penalty = latency_ms * self.latency_penalty_per_ms
        return failure_cost + provider_cost + latency_penalty
def select_cost_optimal_threshold(
    y_true: pd.Series,
    probabilities: pd.Series,
    amounts: pd.Series,
    *,
    false_positive_review_cost: float = 2.50,
    grid_size: int = 201,
) -> dict[str, float]:
    """Pick the operating threshold that minimizes total expected cost.

    A false positive (flagging a legitimate attempt) incurs manual-review and
    customer-friction cost; a false negative (missing a failure) incurs the
    modeled failure exposure. This threshold is a decision aid, never a money
    movement authorization.
    """
    y_bool = y_true.to_numpy().astype(bool)
    probs = probabilities.to_numpy()
    amount_values = amounts.to_numpy()

    candidates = np.linspace(0.0, 1.0, grid_size)
    best_cost = math.inf
    best_threshold = 0.5
    for threshold in candidates:
        pred_failure = (probs >= threshold).astype(int)
        fp = int(((pred_failure == 1) & (y_bool == 0)).sum())
        fn = int(((pred_failure == 0) & (y_bool == 1)).sum())
        fn_amounts = float(
            amount_values[(pred_failure == 0) & (y_bool == 1)].sum()
        )
        fn_cost = fn_amounts * DEFAULT_FAILURE_FRACTION
        fp_cost = fp * false_positive_review_cost
        total_cost = fn_cost + fp_cost
        if total_cost < best_cost:
            best_cost = total_cost
            best_threshold = float(threshold)

    pred_failure = (probs >= best_threshold).astype(int)
    return {
        "threshold": best_threshold,
        "total_cost": float(best_cost),
        "false_positive_count": int(
            ((pred_failure == 1) & (y_bool == 0)).sum()
        ),
        "false_negative_count": int(
            ((pred_failure == 0) & (y_bool == 1)).sum()
        ),
    }


def calibration_error(
    y_true: np.ndarray,
    probabilities: np.ndarray,
    bins: int = 10,
) -> float:
    """Expected calibration error (ECE) using uniform probability bins."""
    if len(np.unique(y_true)) < 2:
        return 0.0
    try:
        fraction_positive, mean_predicted = calibration_curve(
            y_true, probabilities, n_bins=bins, strategy="uniform"
        )
    except ValueError:
        return 0.0
    bin_sizes, _ = np.histogram(probabilities, bins=bins, range=(0.0, 1.0))
    if bin_sizes.sum() == 0:
        return 0.0
    weights = bin_sizes / bin_sizes.sum()
    aligned = weights[: len(fraction_positive)]
    return float(np.sum(aligned * np.abs(fraction_positive - mean_predicted)))


def full_metrics(
    y_true: pd.Series,
    probabilities: pd.Series,
    amounts: pd.Series,
    *,
    threshold: float,
) -> dict[str, float]:
    """Full evaluation metrics at an operating threshold."""
    y_bool = y_true.to_numpy().astype(bool)
    probs = probabilities.to_numpy()
    pred = (probs >= threshold).astype(int)

    tn, fp, fn, tp = confusion_matrix(y_bool, pred, labels=[False, True]).ravel()

    roc_auc_value = (
        float(roc_auc_score(y_bool, probs))
        if len(np.unique(y_bool)) == 2
        else float("nan")
    )
    pr_auc_value = (
        float(average_precision_score(y_bool, probs))
        if len(np.unique(y_bool)) == 2
        else float("nan")
    )

    return {
        "true_positive": int(tp),
        "false_positive": int(fp),
        "true_negative": int(tn),
        "false_negative": int(fn),
        "precision": float(precision_score(y_bool, pred, zero_division=0)),
        "recall": float(recall_score(y_bool, pred, zero_division=0)),
        "f1": float(f1_score(y_bool, pred, zero_division=0)),
        "accuracy": float(accuracy_score(y_bool, pred)),
        "false_positive_rate": float(fp / max(fp + tn, 1)),
        "roc_auc": roc_auc_value,
        "pr_auc": pr_auc_value,
        "brier": float(brier_score_loss(y_bool, probs)),
        "calibration_error_ece": calibration_error(y_bool, probs),
        "threshold": float(threshold),
        "num_evaluated": int(len(y_true)),
    }
def shap_summary(
    model: Any,
    x_eval: pd.DataFrame,
    sample: int = 200,
) -> dict[str, float]:
    """SHAP summary for feature attribution on the evaluation split.

    Unwraps CalibratedClassifierCV if needed, runs TreeExplainer on a bounded
    sample, and returns mean-absolute SHAP values per feature.
    """
    try:
        import shap
    except ImportError as exc:
        raise RuntimeError("shap is required to compute SHAP summaries") from exc

    fitted = model
    if hasattr(model, "calibrated_classifiers_") and model.calibrated_classifiers_:
        first_cc = model.calibrated_classifiers_[0]
        fitted = getattr(first_cc, "estimator", getattr(first_cc, "base_estimator", model))

    n_rows = min(sample, len(x_eval))
    explainer = shap.TreeExplainer(fitted)
    values = explainer.shap_values(x_eval.iloc[:n_rows])
    if isinstance(values, list):
        values = values[-1]
    mean_abs = np.abs(np.asarray(values)).mean(axis=0)
    return {
        str(column): float(value)
        for column, value in zip(x_eval.columns, mean_abs)
        if str(column).startswith("feat_")
    }


def save_report(report: dict[str, Any], path: Path) -> None:
    """Persist a JSON evaluation report next to the model artifacts."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(report, indent=2, default=str) + "\n",
        encoding="utf-8",
    )


__all__ = [
    "CostModel",
    "DEFAULT_FAILURE_FRACTION",
    "DEFAULT_LATENCY_PENALTY_PER_MS",
    "DEFAULT_PROVIDER_COST",
    "calibration_error",
    "full_metrics",
    "save_report",
    "select_cost_optimal_threshold",
    "shap_summary",
]