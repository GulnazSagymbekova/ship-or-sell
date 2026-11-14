// Tracks "items changed after the last Calculate" per move, so the report
// can't be opened with outdated numbers. Survives reloads within the tab.

const key = (moveId: string) => `sos-stale-${moveId}`;

export function markStale(moveId: string) {
  try {
    sessionStorage.setItem(key(moveId), "1");
  } catch {
    /* ignore */
  }
}

export function clearStale(moveId: string) {
  try {
    sessionStorage.removeItem(key(moveId));
  } catch {
    /* ignore */
  }
}

export function isStale(moveId: string) {
  try {
    return sessionStorage.getItem(key(moveId)) === "1";
  } catch {
    return false;
  }
}
