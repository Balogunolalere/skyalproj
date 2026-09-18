/**
 * Admin API client for the customer site.
 *
 * The views used to hand-roll `await fetch(...)` + `if (!res.ok)` in 49 places,
 * each with its own idea of what went wrong — some swallowed the failure
 * (`if (!res.ok) return`), others replaced every error with one generic string
 * ("Order not found" for a 429, a 500 or a network drop alike).
 *
 * `apiFetch` normalises the backend's `{ data } | { error: { code, message } }`
 * envelope and throws an `ApiError` carrying the HTTP status and the backend's
 * error code, so callers can branch on facts. That matters because the backend
 * returns meaningful codes: RATE_LIMITED (429), DELIVERY_STATE_UNKNOWN (400),
 * REQUESTED_PICKUP_REQUIRED (400), INVALID_PICKUP_TIME (400). String-matching a
 * message to decide "no orders yet" versus "slow down" is how a customer gets
 * told their number doesn't exist when the server simply asked them to wait.
 */
const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'https://skyalxpaberin-admin.vercel.app';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  /** The server said this resource does not exist (as opposed to "not now"). */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** The server asked the caller to slow down. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string };
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
      cache: 'no-store',
    });
  } catch (err) {
    // fetch only rejects for network/CORS failures. Keep the transport's own
    // message when there is one (status 0 = never reached the server) and fall
    // back to a sentence a customer can act on.
    const cause = err instanceof Error && err.message ? err.message : '';
    throw new ApiError(cause || 'Network error. Please check your connection and try again.', 0);
  }

  let body: ApiEnvelope<T> | T | null = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON body (a proxy error page, say) — fall through.
  }

  if (!res.ok) {
    const envelope = body as ApiEnvelope<T> | null;
    throw new ApiError(
      envelope?.error?.message || envelope?.error?.code || `Request failed (${res.status})`,
      res.status,
      envelope?.error?.code,
    );
  }

  const envelope = body as ApiEnvelope<T> | null;
  return (envelope?.data ?? (body as T)) as T;
}
