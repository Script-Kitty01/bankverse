# AI Risk Manager

BankVerse includes a defense-only fraud-spike sentinel for Indian UPI payment activity. It detects review-worthy transaction bursts, shared-device activity, unusual night-time spending, and refund patterns. The system recommends `ALLOW`, `REVIEW`, or `BLOCK`; it does not perform offensive security actions.

## Evaluation

The demo creates a deterministic, seeded synthetic dataset of 12,000 India-realistic transactions with labeled card-testing, velocity-ring, night-anomaly, and refund-abuse patterns. A stratified split separates training and held-out records. The detector combines explicit rules with a pure TypeScript logistic regression model, and exposes the model features and triggered reasons for auditability.

The Risk Center reports precision, recall, F1, false-positive rate, confusion matrix values, and expected cost at multiple thresholds. False positives are priced at Rs 150 for review and customer friction; false negatives are priced at Rs 4,500 of estimated fraud exposure. These are transparent demo assumptions, not production estimates.

The data is synthetic and intentionally disclosed. The metrics demonstrate a reproducible evaluation workflow, not a claim of production performance. Production rollout would require representative labeled data, temporal validation, calibration, drift monitoring, fairness review, and human approval controls.