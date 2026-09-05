"""Model registry pointer for the BankVerse ML pipeline.

Keeps versioned model metadata as a JSON pointer file. Models are never
swapped blindly: the pointer stores model version, training timestamp and
window, dataset hash, feature schema version, evaluation metrics, artifact
location, and promotion status. Serving (Phase 5) will read this pointer to
pick the active model and validate schema compatibility before activation.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REGISTRY_PATH = Path(__file__).resolve().parent / "registry" / "registry.json"
MODELS_DIR = Path(__file__).resolve().parent / "models"


@dataclass
class RegistryEntry:
    """One immutable model version record."""

    model_version: str
    model_type: str  # "logistic" | "xgboost"
    task: str  # "failure" | "recovery"
    trained_at: str
    training_start: str
    training_end: str
    dataset_hash: str
    feature_schema_version: int
    artifact_path: str
    metrics: dict[str, float]
    dataset_digest: str = ""
    status: str = "candidate"  # candidate -> shadow -> canary -> active -> rolled_back
    predecessor: str | None = None
    notes: str = ""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_registry() -> dict[str, dict[str, Any]]:
    """Load the registry pointer (empty dict if none exists yet)."""
    if not REGISTRY_PATH.exists():
        return {}
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def save_registry(registry: dict[str, dict[str, Any]]) -> None:
    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    REGISTRY_PATH.write_text(
        json.dumps(registry, indent=2, default=str) + "\n",
        encoding="utf-8",
    )


def write_model(
    model: Any,
    artifact_path: str,
) -> None:
    """Persist a fitted estimator with joblib (or JSON for small models)."""
    import joblib

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    target = MODELS_DIR / artifact_path
    target.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, target)
    return None


def register(
    *,
    model_version: str,
    model_type: str,
    task: str,
    trained_at: str,
    training_start: str,
    training_end: str,
    dataset_hash: str,
    feature_schema_version: int,
    artifact_path: str,
    metrics: dict[str, Any],
    status: str = "candidate",
    predecessor: str | None = None,
    notes: str = "",
) -> dict[str, Any]:
    """Append a versioned registry entry and return the record."""
    entry = RegistryEntry(
        model_version=model_version,
        model_type=model_type,
        task=task,
        trained_at=trained_at,
        training_start=training_start,
        training_end=training_end,
        dataset_hash=dataset_hash,
        feature_schema_version=feature_schema_version,
        artifact_path=artifact_path,
        metrics={k: float(v) for k, v in metrics.items()},
        status=status,
        predecessor=predecessor,
        notes=notes,
    )
    registry = load_registry()
    key = f"{task}:{model_version}"
    registry[key] = asdict(entry)
    save_registry(registry)
    return asdict(entry)


def active_version(task: str = "failure") -> str | None:
    """Return the currently active model version for a task, if one exists."""
    registry = load_registry()
    active = [
        key
        for key, entry in registry.items()
        if key.startswith(f"{task}:") and entry.get("status") == "active"
    ]
    return active[-1].split(":", 1)[1] if active else None


__all__ = [
    "MODELS_DIR",
    "REGISTRY_PATH",
    "RegistryEntry",
    "active_version",
    "load_registry",
    "now_iso",
    "register",
    "save_registry",
    "write_model",
]