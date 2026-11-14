"use client";

// Upload queue for the upload screen: each photo is its own job
// (POST /api/upload → POST /api/analyze), at most LIMITS.uploadConcurrency at once.
// A failed job keeps its photoPath, so Retry only repeats the step that failed.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Item } from "@/types";
import { api } from "@/lib/api";
import { LIMITS } from "@/lib/config";
import { toApiError, type ApiError } from "@/lib/errors";
import { markStale } from "@/lib/staleReport";

export type PhotoStatus = "queued" | "uploading" | "analyzing" | "done" | "error";

export interface PhotoEntry {
  id: string;
  file: File;
  previewUrl: string;
  status: PhotoStatus;
  photoPath: string | null;
  items: Item[];
  error: ApiError | null;
}

let seq = 0;

export function usePhotoQueue(moveId: string) {
  const entriesRef = useRef<PhotoEntry[]>([]);
  const activeRef = useRef(0);
  const [entries, setEntries] = useState<PhotoEntry[]>([]);

  const commit = useCallback(() => setEntries([...entriesRef.current]), []);

  const patch = useCallback(
    (id: string, p: Partial<PhotoEntry>) => {
      entriesRef.current = entriesRef.current.map((e) => (e.id === id ? { ...e, ...p } : e));
      commit();
    },
    [commit],
  );

  const run = useCallback(
    async (id: string) => {
      const entry = () => entriesRef.current.find((e) => e.id === id);
      try {
        let photoPath = entry()?.photoPath ?? null;
        if (!photoPath) {
          patch(id, { status: "uploading", error: null });
          const file = entry()?.file;
          if (!file) return;
          photoPath = (await api.uploadPhoto(moveId, file)).photoPath;
          patch(id, { photoPath });
        }
        if (!entry()) return; // removed meanwhile
        patch(id, { status: "analyzing", error: null });
        const items = await api.analyze(moveId, photoPath);
        patch(id, { status: "done", items });
        if (items.length) markStale(moveId); // report must be recalculated
      } catch (e) {
        if (entry()) patch(id, { status: "error", error: toApiError(e) });
      }
    },
    [moveId, patch],
  );

  const pumpRef = useRef<() => void>(() => {});
  const pump = useCallback(() => pumpRef.current(), []);

  useEffect(() => {
    pumpRef.current = () => {
      while (activeRef.current < LIMITS.uploadConcurrency) {
        const next = entriesRef.current.find((e) => e.status === "queued");
        if (!next) return;
        activeRef.current++;
        // Mark as started synchronously so the loop doesn't pick it twice.
        patch(next.id, { status: next.photoPath ? "analyzing" : "uploading" });
        void run(next.id).finally(() => {
          activeRef.current--;
          pumpRef.current();
        });
      }
    };
  }, [patch, run]);

  const add = useCallback(
    (files: File[]) => {
      const fresh: PhotoEntry[] = files.map((file) => ({
        id: `local_${++seq}`,
        file,
        previewUrl: URL.createObjectURL(file),
        status: "queued",
        photoPath: null,
        items: [],
        error: null,
      }));
      entriesRef.current = [...entriesRef.current, ...fresh];
      commit();
      pump();
    },
    [commit, pump],
  );

  const retry = useCallback(
    (id: string) => {
      patch(id, { status: "queued", error: null });
      pump();
    },
    [patch, pump],
  );

  const remove = useCallback(
    (id: string) => {
      const e = entriesRef.current.find((x) => x.id === id);
      if (!e || e.photoPath || (e.status !== "error" && e.status !== "queued")) return;
      URL.revokeObjectURL(e.previewUrl);
      entriesRef.current = entriesRef.current.filter((x) => x.id !== id);
      commit();
    },
    [commit],
  );

  useEffect(
    () => () => {
      entriesRef.current.forEach((e) => URL.revokeObjectURL(e.previewUrl));
    },
    [],
  );

  return { entries, add, retry, remove };
}
