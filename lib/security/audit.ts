/**
 * Audit logging for sensitive operations.
 * In production, send these to a dedicated logging service (e.g., Sentry, Datadog, CloudWatch).
 */

type AuditAction =
  | "sign_in"
  | "sign_up"
  | "sign_out"
  | "password_change"
  | "profile_update"
  | "bank_link"
  | "bank_unlink"
  | "transfer_initiated"
  | "transfer_completed"
  | "WEBHOOK_PROCESSED"
  | "WEBHOOK_UNKNOWN_TRANSACTION"
  | "WEBHOOK_UNHANDLED_EVENT"
  | "WEBHOOK_OUT_OF_ORDER";

interface AuditLog {
  timestamp: string;
  action: AuditAction;
  userId?: string;
  ip?: string;
  details?: Record<string, unknown>;
  success: boolean;
}

/**
 * Log an audit event.
 */
export function auditLog(log: AuditLog): void {
  const entry = {
    ...log,
    timestamp: log.timestamp || new Date().toISOString(),
  };

  // In production, send to a logging service
  if (process.env.NODE_ENV === "production") {
    // TODO: Send to Sentry, Datadog, or CloudWatch
    console.log(JSON.stringify(entry));
  } else {
    console.log(
      `[AUDIT] ${entry.action} — ${entry.success ? "SUCCESS" : "FAILURE"} — User: ${entry.userId || "anonymous"}`,
    );
  }
}

/**
 * Log a successful sign-in.
 */
export function logSignIn(userId: string, ip?: string): void {
  auditLog({
    timestamp: new Date().toISOString(),
    action: "sign_in",
    userId,
    ip,
    success: true,
  });
}

/**
 * Log a failed sign-in attempt.
 */
export function logFailedSignIn(email: string, ip?: string): void {
  auditLog({
    timestamp: new Date().toISOString(),
    action: "sign_in",
    details: { email },
    ip,
    success: false,
  });
}

/**
 * Log a generic audit event (used by webhooks, system events, etc.).
 */
export function logAuditEvent(
  action: string,
  userId?: string,
  details?: Record<string, unknown>,
): void {
  auditLog({
    timestamp: new Date().toISOString(),
    action: action as AuditAction,
    userId,
    details,
    success: true,
  });
}

/**
 * Log a transfer.
 */
export function logTransfer(
  userId: string,
  amount: number,
  success: boolean,
): void {
  auditLog({
    timestamp: new Date().toISOString(),
    action: "transfer_initiated",
    userId,
    details: { amount },
    success,
  });
}
