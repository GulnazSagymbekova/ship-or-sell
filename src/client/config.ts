// Client-safe config. Only NEXT_PUBLIC_* values may live here.

/** true → every endpoint is mocked (handy without Supabase env). */
export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

export const LIMITS = {
  maxPhotosPerMove: 20,
  maxItemsPerMove: 60,
  /** Client compression target (Vercel body limit is 4.5 MB). */
  maxPhotoSide: 1600,
  jpegQuality: 0.85,
  /** analyze takes 5–20 s, so it runs alongside the next sequential upload. */
  analyzeConcurrency: 3,
} as const;
