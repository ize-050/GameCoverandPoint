const KEY = "hns_reconnect";

export function saveReconnectToken(token: string) {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // localStorage unavailable (private mode etc.) — reconnect just won't be offered
  }
}

export function loadReconnectToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearReconnectToken() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

// Set right before a deliberate `window.location.reload()` (e.g. the language
// toggle). Without this, a mid-match reload races two independent reconnect
// attempts against the same single-use reconnection token: the dying page's
// own `room.onLeave` handler (which sees a non-1000 close code and tries to
// reconnect) and the fresh page's `boot()`. Whichever loses that race gets
// bounced to the Menu even though nothing was actually wrong. Checked once
// by the dying page's onLeave handler so it can skip its own reconnect
// attempt entirely and let the fresh page's boot() be the only one.
const RELOAD_FLAG_KEY = "hns_intentional_reload";

export function markIntentionalReload() {
  try {
    sessionStorage.setItem(RELOAD_FLAG_KEY, "1");
  } catch {
    // ignore
  }
}

export function consumeIntentionalReload(): boolean {
  try {
    const flagged = sessionStorage.getItem(RELOAD_FLAG_KEY) === "1";
    sessionStorage.removeItem(RELOAD_FLAG_KEY);
    return flagged;
  } catch {
    return false;
  }
}
