export type ApiErrorKind =
  | "validation" // 400
  | "payment_required" // 402
  | "not_found" // 404
  | "rate_limited" // 429
  | "ai_busy" // 503
  | "network"; // anything else, incl. offline

export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    public status: number | null,
    message?: string,
  ) {
    super(message ?? kind);
    this.name = "ApiError";
  }
}

export function kindFromStatus(status: number): ApiErrorKind {
  switch (status) {
    case 400:
      return "validation";
    case 402:
      return "payment_required";
    case 404:
      return "not_found";
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
  return new ApiError("network", null, e instanceof Error ? e.message : undefined);
}

const MESSAGES: Record<ApiErrorKind, string> = {
  validation: "Something in the form looks off. Please check and try again.",
  payment_required: "Unlock the full report to see this.",
  not_found: "Move not found.",
  rate_limited: "You've hit the hourly limit. Try again later.",
  ai_busy: "Our AI is busy. Try again in a minute.",
  network: "Something went wrong. Check your connection and retry.",
};

/** User-facing text for an error. `overrides` lets a screen tune copy per kind. */
export function errorMessage(e: unknown, overrides: Partial<Record<ApiErrorKind, string>> = {}): string {
  const kind = toApiError(e).kind;
  return overrides[kind] ?? MESSAGES[kind];
}
