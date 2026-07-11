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
