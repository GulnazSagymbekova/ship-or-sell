// The frontend's only API client. Screens import `api` from here and nothing else.
//
// Endpoints that B/C haven't shipped yet are served by src/mock/mocks.ts. To switch one
// to the real backend, flip its flag in LIVE below — the UI doesn't change.
// NEXT_PUBLIC_USE_MOCKS=true mocks everything (no Supabase env needed).

import type { Category, CheckoutPlan, EstimateResult, Item, Listing, Move, MoveDetails, MoveType } from "@/types";
import type { Place } from "@/lib/places";
import { USE_MOCKS } from "@/client/config";
import { ApiError, kindFromStatus } from "@/client/errors";
import { forgetMove, mockApi, overlayDetails } from "@/mock/mocks";

/** Body of POST /api/moves. */
export interface MoveInput {
  fromZip: string;
  toZip: string;
  moveType: MoveType;
  moveDate: string; // YYYY-MM-DD
}

/** Body of POST /api/items (manual add). */
export interface NewItemInput {
  moveId: string;
  photoPath: string;
  category: Category;
  name: string;
}

/** Which endpoints are live on the backend. Flip to true when B/C ship them. */
const LIVE = {
  moves: true, // GET/POST /api/moves, GET/DELETE /api/moves/:id
  upload: true, // POST /api/upload
  analyze: true, // POST /api/analyze
  items: true, // POST /api/items, PATCH/DELETE /api/items/:id
  estimate: true, // POST /api/estimate
  listings: true, // POST /api/listings (402 until the move is paid)
  checkout: true, // POST /api/checkout (Stripe Checkout, Move Pass $29)
} as const;

const live = (k: keyof typeof LIVE) => !USE_MOCKS && LIVE[k];

/** fetch wrapper: JSON in/out, HTTP status → typed ApiError with the server's `message`. */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
    res = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: isForm ? init.headers : { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new ApiError("network", null);
  }

  if (!res.ok) {
    let message: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      message = typeof body?.message === "string" ? body.message : undefined;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(kindFromStatus(res.status), res.status, message);
  }

  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError("network", res.status);
  }
}

const json = (body: unknown) => JSON.stringify(body);
const enc = encodeURIComponent;

const real = {
  listMoves: () => request<Move[]>("/api/moves"),
  createMove: (input: MoveInput) => request<Move>("/api/moves", { method: "POST", body: json(input) }),
  getMove: (id: string) => request<MoveDetails>(`/api/moves/${enc(id)}`),
  deleteMove: (id: string) => request<void>(`/api/moves/${enc(id)}`, { method: "DELETE" }),
  uploadPhoto: (moveId: string, file: Blob, filename = "photo.jpg") => {
    const form = new FormData();
    form.append("file", file, filename);
    form.append("moveId", moveId);
    return request<{ photoPath: string }>("/api/upload", { method: "POST", body: form });
  },
  analyze: (moveId: string, photoPath: string) =>
    request<Item[]>("/api/analyze", { method: "POST", body: json({ moveId, photoPath }) }),
  addItem: (input: NewItemInput) => request<Item>("/api/items", { method: "POST", body: json(input) }),
  updateItem: (id: string, patch: Partial<Item>) =>
    request<Item>(`/api/items/${enc(id)}`, { method: "PATCH", body: json(patch) }),
  deleteItem: (id: string) => request<void>(`/api/items/${enc(id)}`, { method: "DELETE" }),
  estimate: (moveId: string) => request<EstimateResult>("/api/estimate", { method: "POST", body: json({ moveId }) }),
  createListing: (itemId: string) => request<Listing>("/api/listings", { method: "POST", body: json({ itemId }) }),
  checkout: (moveId: string, plan: CheckoutPlan = "pass") =>
    request<{ url: string }>("/api/checkout", { method: "POST", body: json({ moveId, plan }) }),
  searchPlaces: (q: string) => request<Place[]>(`/api/places?q=${enc(q)}`),
};

export const api: {
  [K in keyof typeof real]: (typeof real)[K];
} = {
  listMoves: () => (live("moves") ? real.listMoves() : mockApi.listMoves()),
  createMove: (input: MoveInput) => (live("moves") ? real.createMove(input) : mockApi.createMove(input)),
  getMove: async (id: string): Promise<MoveDetails> => {
    if (!live("moves")) return mockApi.getMove(id);
    const details = await real.getMove(id);
    // Overlay mocked items/estimates/listings until those endpoints are live.
    return LIVE.analyze && LIVE.estimate && LIVE.checkout ? details : overlayDetails(details);
  },
  deleteMove: async (id: string) => {
    if (!live("moves")) return mockApi.deleteMove(id);
    await real.deleteMove(id);
    forgetMove(id);
  },
  uploadPhoto: (moveId: string, file: Blob, filename?: string) =>
    live("upload") ? real.uploadPhoto(moveId, file, filename) : mockApi.uploadPhoto(moveId, file),
  analyze: (moveId: string, photoPath: string) =>
    live("analyze") ? real.analyze(moveId, photoPath) : mockApi.analyze(moveId, photoPath),
  addItem: (input: NewItemInput) => (live("items") ? real.addItem(input) : mockApi.addItem(input)),
  updateItem: (id: string, patch: Partial<Item>) =>
    live("items") ? real.updateItem(id, patch) : mockApi.updateItem(id, patch),
  deleteItem: (id: string) => (live("items") ? real.deleteItem(id) : mockApi.deleteItem(id)),
  estimate: async (moveId: string) => {
    if (live("estimate")) return real.estimate(moveId);
    // Hybrid: refresh the real move + items first so the mock prices what's on the server.
    if (live("moves")) await api.getMove(moveId);
    return mockApi.estimate(moveId);
  },
  createListing: (itemId: string) => (live("listings") ? real.createListing(itemId) : mockApi.createListing(itemId)),
  checkout: (moveId: string, plan: CheckoutPlan = "pass") =>
    live("checkout") ? real.checkout(moveId, plan) : mockApi.checkout(moveId),
  // Публичный справочник городов — всегда настоящий, и в mock-режиме тоже.
  searchPlaces: (q: string) => real.searchPlaces(q),
};

export type Api = typeof api;
