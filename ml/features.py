"""Causal, strictly-prior feature engineering for provider-outcome prediction.

Every feature for a given (transaction, provider) row is computed only from rows
observed strictly before the row's own timestamp. No future provider outcome can
influence an earlier routing decision (plan-telemetry verification 4, 13, 14).

The dataset contains one row per (transaction, provider). For each row we build
per-provider rolling features from strictly prior attempts:

- success/failure/timeout/decline rates over rolling attempt windows,
- latency mean and p90 over the same windows,
- attempt number, amount bands, payment method one-hots, time-of-day,
  merchant repeat, regime state, provider identity, recent-incident flag,
  and the (redacted) fraud proxy rate.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# Rolling windows are measured in provider attempts (the natural causal scale).
ATTEMPT_WINDOWS: tuple[int, ...] = (5, 10, 20)

# Sentinel used when no prior window data exists yet (cold start).
RAW_MISSING: float = -1.0

_OUTCOME_TO_CODE: dict[str, int] = {
    "SUCCESS": 0,
    "FAILURE": 1,
    "TIMEOUT": 2,
    "DECLINED": 3,
}

FEATURE_COLUMNS: list[str] = [
    "feat_window_5_success_rate",
    "feat_window_5_failure_rate",
    "feat_window_5_timeout_rate",
    "feat_window_5_decline_rate",
    "feat_window_10_success_rate",
    "feat_window_10_failure_rate",
    "feat_window_10_timeout_rate",
    "feat_window_10_decline_rate",
    "feat_window_20_success_rate",
    "feat_window_20_failure_rate",
    "feat_window_20_timeout_rate",
    "feat_window_20_decline_rate",
    "feat_latency_mean_5",
    "feat_latency_mean_10",
    "feat_latency_mean_20",
    "feat_latency_p90_5",
    "feat_latency_p90_10",
    "feat_latency_p90_20",
    "feat_attempt_number",
    "feat_amount_log",
    "feat_amount_bucket_10",
    "feat_amount_bucket_50",
    "feat_amount_bucket_100",
    "feat_amount_bucket_500",
    "feat_amount_bucket_10000",
    "feat_amount_bucket_over",
    "feat_method_upi",
    "feat_method_card",
    "feat_method_netbanking",
    "feat_method_wallet",
    "feat_hour",
    "feat_night",
    "feat_weekend",
    "feat_merchant_repeat",
    "feat_regime_provider_stress",
    "feat_regime_high_declines",
    "feat_regime_normal",
    "feat_provider_beta",
    "feat_provider_gamma",
    "feat_recent_incident",
    "feat_fraud_proxy_rate",
]


def amount_bucket(amount: float) -> str:
    """Bucket an amount into the same bands used by the ingestion pipeline."""
    if amount <= 10:
        return "10"
    if amount <= 50:
        return "50"
    if amount <= 100:
        return "100"
    if amount <= 500:
        return "500"
    if amount <= 10_000:
        return "10000"
    return "over"


def timestamp_time_features(timestamps: pd.Series) -> pd.DataFrame:
    """Derive time-of-day and cycle-aware features from a UTC timestamp series."""
    ts = pd.to_datetime(timestamps, utc=True)
    hours = ts.dt.hour + ts.dt.minute / 60.0
    dow = ts.dt.dayofweek
    return pd.DataFrame(
        {
            "hour": hours.astype(float).values,
            "night": (hours >= 20).astype(float).values,
            "weekend": (dow >= 5).astype(float).values,
        },
        index=ts.index,
    )
def build_features(frame: pd.DataFrame) -> pd.DataFrame:
    """Build causal rolling features from the canonical attempt dataset.

    ``frame`` must contain the ``data/ml_dataset.csv`` schema. Each rolling
    statistic uses only rows with strictly earlier timestamps per provider.
    """
    sorted_frame = frame.sort_values("timestamp", kind="mergesort")
    pieces: list[pd.DataFrame] = []

    for _, group in sorted_frame.groupby("provider", sort=False):
        group = group.sort_values("timestamp")
        n = len(group)

        codes = group["outcome"].map(_OUTCOME_TO_CODE).astype(int).to_numpy()
        latencies = group["latency_ms"].astype(float).to_numpy()

        prior_indicators: list[list[float]] = []
        prior_latencies: list[float] = []

        feat: dict[str, np.ndarray] = {}
        for w in ATTEMPT_WINDOWS:
            for name in ("success", "failure", "timeout", "decline"):
                feat[f"feat_window_{w}_{name}_rate"] = np.full(
                    n, RAW_MISSING, dtype=np.float64
                )
            feat[f"feat_latency_mean_{w}"] = np.full(
                n, RAW_MISSING, dtype=np.float64
            )
            feat[f"feat_latency_p90_{w}"] = np.full(
                n, RAW_MISSING, dtype=np.float64
            )

        recent_bad = np.zeros(n, dtype=np.float64)

        for pos in range(n):
            for w in ATTEMPT_WINDOWS:
                if prior_indicators:
                    indicators = np.asarray(prior_indicators[-w:])
                    totals = indicators.sum(axis=0)
                    total = float(totals.sum())
                    if total > 0:
                        feat[f"feat_window_{w}_success_rate"][pos] = totals[0] / total
                        feat[f"feat_window_{w}_failure_rate"][pos] = totals[1] / total
                        feat[f"feat_window_{w}_timeout_rate"][pos] = totals[2] / total
                        feat[f"feat_window_{w}_decline_rate"][pos] = totals[3] / total
                if prior_latencies:
                    window_lat = prior_latencies[-w:]
                    feat[f"feat_latency_mean_{w}"][pos] = float(np.mean(window_lat))
                    feat[f"feat_latency_p90_{w}"][pos] = float(
                        np.percentile(window_lat, 90)
                    )

            if prior_indicators:
                window = np.asarray(prior_indicators[-5:])
                bad_count = float((window[:, 1] + window[:, 2]).sum())
                recent_bad[pos] = 1.0 if bad_count >= 2 else 0.0

            code = int(codes[pos])
            prior_indicators.append(
                [1.0 if code == label else 0.0 for label in (0, 1, 2, 3)]
            )
            prior_latencies.append(float(latencies[pos]))
        # --- Static / non-window features for this provider group. ---
        feat["feat_attempt_number"] = np.arange(1, n + 1, dtype=np.float64)
        amounts = group["amount"].astype(float).to_numpy()
        feat["feat_amount_log"] = np.log1p(np.maximum(amounts, 0.0))
        buckets = np.asarray([amount_bucket(a) for a in amounts])
        for band in ("10", "50", "100", "500", "10000", "over"):
            feat[f"feat_amount_bucket_{band}"] = (buckets == band).astype(np.float64)
        methods = group["payment_method"].astype(str).to_numpy()
        for method in ("upi", "card", "netbanking", "wallet"):
            feat[f"feat_method_{method}"] = (methods == method).astype(np.float64)
        time_feat = timestamp_time_features(group["timestamp"])
        feat["feat_hour"] = time_feat["hour"].values
        feat["feat_night"] = time_feat["night"].values
        feat["feat_weekend"] = time_feat["weekend"].values
        merchants = group["merchant_category"].astype(str).to_numpy()
        seen: set[str] = set()
        merchant_repeat = np.zeros(n, dtype=np.float64)
        for pos_m, merchant in enumerate(merchants):
            if merchant in seen:
                merchant_repeat[pos_m] = 1.0
            seen.add(merchant)
        feat["feat_merchant_repeat"] = merchant_repeat
        regimes = group["regime"].astype(str).to_numpy()
        feat["feat_regime_provider_stress"] = (regimes == "provider_stress").astype(np.float64)
        feat["feat_regime_high_declines"] = (regimes == "high_declines").astype(np.float64)
        feat["feat_regime_normal"] = (regimes == "normal").astype(np.float64)
        providers = group["provider"].astype(str).to_numpy()
        feat["feat_provider_beta"] = (providers == "provider_beta").astype(np.float64)
        feat["feat_provider_gamma"] = (providers == "provider_gamma").astype(np.float64)
        feat["feat_recent_incident"] = recent_bad
        feat["feat_fraud_proxy_rate"] = group["fraud_proxy_rate"].astype(float).to_numpy()
        pieces.append(pd.DataFrame(feat, index=group.index))
    if not pieces:
        return pd.DataFrame(columns=FEATURE_COLUMNS, index=frame.index)
    features = pd.concat(pieces)
    features = features.reindex(columns=FEATURE_COLUMNS)
    return features.reindex(frame.index)

def verify_causality(frame: pd.DataFrame, features: pd.DataFrame) -> None:
    check_col = "feat_window_5_success_rate"
    if check_col not in features.columns:
        return
    merged = frame.assign(_rate=features[check_col].values)
    recomputed: list[float] = []
    recomputed_indices: list[Any] = []
    for _, group in merged.sort_values("timestamp").groupby("provider", sort=False):
        group = group.sort_values("timestamp")
        prior: list[float] = []
        for idx, row in group.iterrows():
            if prior:
                recomputed.append(sum(prior[-5:]) / len(prior[-5:]))
            else:
                recomputed.append(RAW_MISSING)
            prior.append(1.0 if row["outcome"] == "SUCCESS" else 0.0)
            recomputed_indices.append(idx)
    recomputed_series = pd.Series(recomputed, index=recomputed_indices).reindex(merged.index)
    mismatch = ~np.isclose(features[check_col], recomputed_series, atol=1e-9)
    if mismatch.any():
        bad = merged.index[mismatch][:5]
        raise AssertionError(f"Causality guard failed: {int(mismatch.sum())} rows disagree")
    return None

__all__ = ["ATTEMPT_WINDOWS", "FEATURE_COLUMNS", "RAW_MISSING", "amount_bucket", "build_features", "timestamp_time_features", "verify_causality"]
