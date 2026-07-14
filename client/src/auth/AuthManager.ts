export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  picture: string;
  provider: "google";
}

interface StoredSession { token: string; user: AuthUser }

const GUEST_ID_KEY = "clockout_guest_id";
const AUTH_SESSION_KEY = "clockout_auth_session";
const GOOGLE_CLIENT_ID = String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "");
const wsUrl = String(import.meta.env.VITE_SERVER_URL ?? "ws://localhost:2567");
const API_URL = String(import.meta.env.VITE_API_URL ?? wsUrl.replace(/^ws/, "http")).replace(/\/$/, "");

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(options: { client_id: string; callback: (response: { credential?: string }) => void }): void;
          renderButton(element: HTMLElement, options: Record<string, string | number>): void;
        };
      };
    };
  }
}

function newGuestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function readSession(): StoredSession | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) ?? "null") as StoredSession | null;
    return parsed?.token && parsed.user?.id ? parsed : null;
  } catch {
    return null;
  }
}

let googleScriptPromise: Promise<void> | undefined;
function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("GOOGLE_SCRIPT_FAILED")), { once: true });
    if (!existing) {
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
  return googleScriptPromise;
}

class AuthManager {
  private session = readSession();

  get user(): AuthUser | null { return this.session?.user ?? null; }
  get isGoogleConfigured(): boolean { return Boolean(GOOGLE_CLIENT_ID); }

  getGuestId(): string {
    let guestId = localStorage.getItem(GUEST_ID_KEY) ?? "";
    if (!/^[a-zA-Z0-9-]{16,64}$/.test(guestId)) {
      guestId = newGuestId();
      localStorage.setItem(GUEST_ID_KEY, guestId);
    }
    return guestId;
  }

  getRoomIdentity() {
    return { guestId: this.getGuestId(), authToken: this.session?.token ?? "" };
  }

  async restore(): Promise<AuthUser | null> {
    if (!this.session) return null;
    try {
      const response = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${this.session.token}` } });
      if (!response.ok) throw new Error("INVALID_SESSION");
      const body = await response.json() as { user: AuthUser };
      this.session.user = body.user;
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(this.session));
      return body.user;
    } catch {
      this.signOut();
      return null;
    }
  }

  async renderGoogleButton(container: HTMLElement, onSignedIn: (user: AuthUser) => void, onError: (message: string) => void) {
    if (!GOOGLE_CLIENT_ID) return;
    try {
      await loadGoogleScript();
      if (!container.isConnected || !window.google?.accounts.id) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          if (!credential) return onError("GOOGLE_CREDENTIAL_MISSING");
          try {
            const response = await fetch(`${API_URL}/auth/google`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credential }),
            });
            if (!response.ok) throw new Error("GOOGLE_SIGN_IN_REJECTED");
            this.session = await response.json() as StoredSession;
            localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(this.session));
            onSignedIn(this.session.user);
          } catch {
            onError("GOOGLE_SIGN_IN_REJECTED");
          }
        },
      });
      container.innerHTML = "";
      window.google.accounts.id.renderButton(container, { theme: "filled_black", size: "large", shape: "pill", width: 280, text: "continue_with" });
    } catch {
      onError("GOOGLE_SCRIPT_FAILED");
    }
  }

  signOut() {
    this.session = null;
    localStorage.removeItem(AUTH_SESSION_KEY);
  }
}

export const authManager = new AuthManager();
