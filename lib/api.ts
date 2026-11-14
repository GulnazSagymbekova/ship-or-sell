// Single API client for the frontend. Screens import only from here.
// With NEXT_PUBLIC_USE_MOCKS=true every call is served by lib/mocks.ts
// using exactly the same types, so switching to the real backend needs no UI changes.

import type { Category, EstimateResult, Item, Listing, Move, MoveDetails, MoveType } from "@/types";
import { USE_MOCKS } from "./config";
import { ApiError, kindFromStatus } from "./errors";
import { mockApi } from "./mocks";

/** Body of POST /api/moves (move form). */
export interface MoveInput {
  fromZip: string;
  toZip: string;
  moveDate: string; // YYYY-MM-DD
  moveType: MoveType;
}

/** Body of POST /api/items (manual add). */
export interface NewItemInput {
  moveId: string;
  photoPath: string;
  category: Category;
  name: string;
}

/** fetch wrapper: JSON in/out, HTTP status → typed ApiError. */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
    res = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: isForm ? init.headers : { "Content-Type": "application/json", ...init.headers },
    });
  } catch (e) {
    throw new ApiError("network", null, e instanceof Error ? e.message : "fetch failed");
  }

  if (!res.ok) {
    let message: string | undefined;
    try {
      const body = await res.json();
      message = typeof body?.error === "string" ? body.error : undefined;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(kindFromStatus(res.status), res.status, message);
  }

  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError("network", res.status, "invalid JSON");
  }
}

const json = (body: unknown) => JSON.stringify(body);

const realApi = {
  listMoves: () => request<Move[]>("/api/moves"),
  createMove: (input: MoveInput) => request<Move>("/api/moves", { method: "POST", body: json(input) }),
  getMove: (id: string) => request<MoveDetails>(`/api/moves/${encodeURIComponent(id)}`),
  deleteMove: (id: string) => request<void>(`/api/moves/${encodeURIComponent(id)}`, { method: "DELETE" }),

  uploadPhoto: (moveId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("moveId", moveId);
    return request<{ photoPath: string }>("/api/upload", { method: "POST", body: form });
  },
  analyze: (moveId: string, photoPath: string) =>
    request<Item[]>("/api/analyze", { method: "POST", body: json({ moveId, photoPath }) }),

  addItem: (input: NewItemInput) => request<Item>("/api/items", { method: "POST", body: json(input) }),
  updateItem: (id: string, patch: Partial<Item>) =>
    request<Item>(`/api/items/${encodeURIComponent(id)}`, { method: "PATCH", body: json(patch) }),
  deleteItem: (id: string) => request<void>(`/api/items/${encodeURIComponent(id)}`, { method: "DELETE" }),

  estimate: (moveId: string) => request<EstimateResult>("/api/estimate", { method: "POST", body: json({ moveId }) }),
  createListing: (itemId: string) => request<Listing>("/api/listings", { method: "POST", body: json({ itemId }) }),
  checkout: (moveId: string) => request<{ url: string }>("/api/checkout", { method: "POST", body: json({ moveId }) }),
};

export type Api = typeof realApi;

export const api: Api = USE_MOCKS ? mockApi : realApi;
