/**
 * BankVerse — Safe HTTP Request Helpers
 *
 * SRE hardening:
 *  - `safeParseJson` guarantees malformed/empty JSON payloads produce a
 *    controlled `400 Bad Request` instead of an unhandled exception that is
 *    surfaced as a misleading `500 Internal Server Error`.
 *  - `readJsonBody` reads a request body as text and parses it safely,
 *    returning a typed result instead of throwing.
 */

export type JsonParseResult<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Parse a raw JSON string without throwing. Returns a discriminated union so
 * callers can return a proper 400 response on malformed input.
 */
export function tryParseJson<T = Record<string, unknown>>(
  raw: string,
): JsonParseResult<T> {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, error: "Request body is empty" };
  }

  try {
    const data = JSON.parse(raw) as T;
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, error: "Request body must be a JSON object" };
    }
    return { ok: true, data };
  } catch (e: unknown) {
    return {
      ok: false,
      error: `Invalid JSON payload: ${(e as Error).message || "parse error"}`,
    };
  }
}

/**
 * Read and safely parse the JSON body of a web Request.
 */
export async function readJsonBody<T = Record<string, unknown>>(
  request: Request,
): Promise<JsonParseResult<T>> {
  try {
    const raw = await request.text();
    return tryParseJson<T>(raw);
  } catch (e: unknown) {
    return {
      ok: false,
      error: `Unable to read request body: ${(e as Error).message || "read error"}`,
    };
  }
}