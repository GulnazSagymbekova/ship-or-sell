"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MoveDetails } from "@/types";
import { api } from "@/lib/api";

/**
 * Loads GET /api/moves/:id. `refreshPhotos` re-fetches once when a signed URL
 * has expired (<img onError>), without looping if the photo is truly broken.
 */
export function useMoveDetails(moveId: string) {
  const [details, setDetails] = useState<MoveDetails | null>(null);
  const [error, setError] = useState<unknown>(null);
  const refreshed = useRef(false);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const d = await api.getMove(moveId);
      setDetails(d);
      return d;
    } catch (e) {
      setError(e);
      return null;
    }
  }, [moveId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void reload();
  }, [reload]);

  const refreshPhotos = useCallback(() => {
    if (refreshed.current) return;
    refreshed.current = true;
    api
      .getMove(moveId)
      .then((d) => setDetails((prev) => (prev ? { ...prev, photoUrls: d.photoUrls } : d)))
      .catch(() => {});
  }, [moveId]);

  return { details, setDetails, error, reload, refreshPhotos };
}
