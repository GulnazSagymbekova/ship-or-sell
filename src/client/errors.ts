// Typed API errors. Backend sends { error: "<code>", message?: string } (see src/lib/http.ts).

export type ApiErrorKind =
  | "validation" // 400 → show message
  | "unauthorized" // 401 → no anonymous session
  | "payment_required" // 402 → paywall
  | "not_found" // 404
  | "conflict" // 409 → show message
  | "rate_limited" // 429 → show message (limit)
  | "ai_busy" // 503
  | "network"; // 500, offline, anything else

export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    public status: number | null,
    /** Human-readable `message` from the server body, if any. */
    public serverMessage?: string,
  ) {
    super(serverMessage ?? kind);
    this.name = "ApiError";
  }
}

export function kindFromStatus(status: number): ApiErrorKind {
  switch (status) {
    case 400:
      return "validation";
    case 401:
      return "unauthorized";
    case 402:
      return "payment_required";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 429:
      return "rate_limited";
    case 503:
      return "ai_busy";
    default:
      return "network";
  }
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  return new ApiError("network", null);
}

const FALLBACK: Record<ApiErrorKind, string> = {
  validation: "Something in the form looks off. Please check and try again.",
  unauthorized: "Something went wrong, refresh the page.",
  payment_required: "Unlock full report & listings — $29",
  not_found: "Not found.",
  conflict: "That can't be done right now.",
  rate_limited: "You've hit a limit. Try again later.",
  ai_busy: "Our AI is busy, try again in a minute.",
  network: "Something went wrong. Check your connection and retry.",
};

/** Kinds where the server's `message` is meant for the user. */
const SHOW_SERVER_MESSAGE = new Set<ApiErrorKind>(["validation", "conflict", "rate_limited"]);

/** User-facing text for an error. `overrides` replaces the fallback copy per kind. */
export function errorMessage(e: unknown, overrides: Partial<Record<ApiErrorKind, string>> = {}): string {
  const err = toApiError(e);
  if (SHOW_SERVER_MESSAGE.has(err.kind) && err.serverMessage) return err.serverMessage;
  return overrides[err.kind] ?? FALLBACK[err.kind];
}
