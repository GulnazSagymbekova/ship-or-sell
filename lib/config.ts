// Client-safe config. Only NEXT_PUBLIC_* values may live here.
export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

export const LIMITS = {
  maxPhotosPerMove: 20,
  maxItemsPerMove: 60,
  maxPhotoBytes: 10 * 1024 * 1024,
  uploadConcurrency: 4,
  magicLinkResendSec: 60,
} as const;
