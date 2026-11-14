"use client";

// Photo pipeline for /move/{id}:
//   compress (canvas → JPEG ≤1600px) → POST /api/upload, strictly one file at a time,
//   then POST /api/analyze for that photo while the next file uploads (≤3 analyses at once).
// A failed photo keeps its photoPath, so Retry only repeats the step that failed.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Item } from "@/types";
import { api } from "@/lib/api-client";
import { LIMITS } from "@/client/config";
import { ApiError, toApiError } from "@/client/errors";
import { compressImage } from "@/client/image";
import { markStale } from "@/client/staleReport";

export type PhotoStatus = "queued" | "uploading" | "analyzing" | "done" | "error";

export interface PhotoEntry {
  id: string;
  file: File;
  previewUrl: string;
  status: PhotoStatus;
  photoPath: string | null;
  itemCount: number;
  error: ApiError | null;
}

let seq = 0;

export function usePhotoPipeline(
  moveId: string,
  handlers: { onUploaded: (photoPath: string, previewUrl: string) => void; onAnalyzed: (items: Item[]) => void },
) {
  const entriesRef = useRef<PhotoEntry[]>([]);
  const [entries, setEntries] = useState<PhotoEntry[]>([]);
  const uploading = useRef(false);
  const analyzing = useRef(0);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const patch = useCallback((id: string, p: Partial<PhotoEntry>) => {
    entriesRef.current = entriesRef.current.map((e) => (e.id === id ? { ...e, ...p } : e));
    setEntries(entriesRef.current);
  }, []);
  const get = (id: string) => entriesRef.current.find((e) => e.id === id);

  const pumpRef = useRef<() => void>(() => {});

  useEffect(() => {
    const analyze = async (id: string, photoPath: string) => {
      analyzing.current++;
      patch(id, { status: "analyzing", error: null });
      try {
        const items = await api.analyze(moveId, photoPath);
        patch(id, { status: "done", itemCount: items.length });
        if (items.length) {
          markStale(moveId);
          handlersRef.current.onAnalyzed(items);
        }
      } catch (e) {
        patch(id, { status: "error", error: toApiError(e) });
      } finally {
        analyzing.current--;
        pumpRef.current();
      }
    };

    const upload = async (entry: PhotoEntry) => {
      uploading.current = true;
      patch(entry.id, { status: "uploading", error: null });
      try {
        const blob = await compressImage(entry.file).catch(() => {
          throw new ApiError("validation", 400, "This photo couldn't be read. Try a JPEG or PNG.");
        });
        const { photoPath } = await api.uploadPhoto(moveId, blob, "photo.jpg");
        patch(entry.id, { photoPath, status: "queued" });
        handlersRef.current.onUploaded(photoPath, entry.previewUrl);
      } catch (e) {
        patch(entry.id, { status: "error", error: toApiError(e) });
      } finally {
        uploading.current = false;
        pumpRef.current();
      }
    };

    pumpRef.current = () => {
      // Analyses for already-uploaded photos (bounded).
      for (const e of entriesRef.current) {
        if (analyzing.current >= LIMITS.analyzeConcurrency) break;
        if (e.status === "queued" && e.photoPath) void analyze(e.id, e.photoPath);
      }
      // One upload at a time, in order.
      if (!uploading.current) {
        const next = entriesRef.current.find((e) => e.status === "queued" && !e.photoPath);
        if (next) void upload(next);
      }
    };
  }, [moveId, patch]);

  const add = useCallback((files: File[]) => {
    const fresh: PhotoEntry[] = files.map((file) => ({
      id: `local_${++seq}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: "queued",
      photoPath: null,
      itemCount: 0,
      error: null,
    }));
    entriesRef.current = [...entriesRef.current, ...fresh];
    setEntries(entriesRef.current);
    pumpRef.current();
  }, []);

  const retry = useCallback(
    (id: string) => {
      patch(id, { status: "queued", error: null });
      pumpRef.current();
    },
    [patch],
  );

  /** Remove a photo that never reached the server. */
  const remove = useCallback((id: string) => {
    const e = get(id);
    if (!e || e.photoPath || (e.status !== "error" && e.status !== "queued")) return;
    URL.revokeObjectURL(e.previewUrl);
    entriesRef.current = entriesRef.current.filter((x) => x.id !== id);
    setEntries(entriesRef.current);
  }, []);

  useEffect(
    () => () => {
      // Keep blob URLs alive while the page lives; release on unmount.
      entriesRef.current.forEach((e) => URL.revokeObjectURL(e.previewUrl));
    },
    [],
  );

  const total = entries.length;
  const uploaded = entries.filter((e) => e.photoPath).length;
  const busy = entries.some((e) => e.status === "uploading" || e.status === "analyzing" || e.status === "queued");

  return { entries, add, retry, remove, progress: { total, uploaded }, busy };
}
