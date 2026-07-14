import type { Session, SupabaseClient, User } from "@supabase/supabase-js";

export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  picture: string;
  provider: "google";
}

export interface PlayerProfile {
  xp: number;
  level: number;
  coins: number;
  gamesPlayed: number;
  escapes: number;
  catches: number;
  missionsCompleted: number;
}

const GUEST_ID_KEY = "clockout_guest_id";
const AUTH_RETURN_KEY = "clockout_auth_return";
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL ?? "");
const SUPABASE_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "");
let supabasePromise: Promise<SupabaseClient | null> | undefined;
function getSupabase(): Promise<SupabaseClient | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return Promise.resolve(null);
  supabasePromise ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  );
  return supabasePromise;
}

function newGuestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    displayName: String(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Employee").slice(0, 40),
    email: user.email ?? "",
    picture: String(user.user_metadata?.avatar_url || user.user_metadata?.picture || ""),
    provider: "google",
  };
}

class AuthManager {
  private session: Session | null = null;
  private restored?: Promise<AuthUser | null>;

  get user(): AuthUser | null { return this.session?.user ? toAuthUser(this.session.user) : null; }
  get isGoogleConfigured(): boolean { return Boolean(SUPABASE_URL && SUPABASE_KEY); }

  getGuestId(): string {
    let guestId = localStorage.getItem(GUEST_ID_KEY) ?? "";
    if (!/^[a-zA-Z0-9-]{16,64}$/.test(guestId)) {
      guestId = newGuestId();
      localStorage.setItem(GUEST_ID_KEY, guestId);
    }
    return guestId;
  }

  consumeAuthReturn(): boolean {
    const shouldReturn = sessionStorage.getItem(AUTH_RETURN_KEY) === "play";
    sessionStorage.removeItem(AUTH_RETURN_KEY);
    return shouldReturn;
  }

  async getRoomIdentity() {
    await this.restore();
    return { guestId: this.getGuestId(), authToken: this.session?.access_token ?? "" };
  }

  async restore(): Promise<AuthUser | null> {
    const supabase = await getSupabase();
    if (!supabase) return null;
    if (!this.restored) {
      this.restored = (async () => {
        const { data } = await supabase.auth.getSession();
        this.session = data.session;
        if (!this.session) return null;
        const { data: verified, error } = await supabase.auth.getUser(this.session.access_token);
        if (error || !verified.user) {
          await supabase.auth.signOut({ scope: "local" });
          this.session = null;
          return null;
        }
        return toAuthUser(verified.user);
      })();
    }
    return this.restored;
  }

  async renderGoogleButton(container: HTMLElement, _onSignedIn: (user: AuthUser) => void, onError: (message: string) => void) {
    const supabase = await getSupabase();
    if (!supabase || !container.isConnected) return;
    container.innerHTML = "";
    const button = document.createElement("button");
    button.className = "hns-btn hns-btn-secondary";
    button.style.cssText = "width:280px;background:#fff;color:#1f2937;border-color:#d1d5db;display:flex;align-items:center;justify-content:center;gap:10px;";
    button.innerHTML = '<span style="font-size:18px;font-weight:950;color:#4285f4;">G</span><span>Continue with Google</span>';
    button.addEventListener("click", async () => {
      button.disabled = true;
      sessionStorage.setItem(AUTH_RETURN_KEY, "play");
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${location.origin}${location.pathname}` },
      });
      if (error) {
        button.disabled = false;
        onError(error.message);
      }
    });
    container.appendChild(button);
  }

  async loadProfile(): Promise<PlayerProfile | null> {
    const supabase = await getSupabase();
    if (!supabase || !this.session?.user) return null;
    const userId = this.session.user.id;
    const [{ data: profile }, { data: stats }] = await Promise.all([
      supabase.from("profiles").select("xp,level,coins").eq("user_id", userId).maybeSingle(),
      supabase.from("player_stats").select("games_played,escapes,catches,missions_completed").eq("user_id", userId).maybeSingle(),
    ]);
    return {
      xp: Number(profile?.xp ?? 0), level: Number(profile?.level ?? 1), coins: Number(profile?.coins ?? 0),
      gamesPlayed: Number(stats?.games_played ?? 0), escapes: Number(stats?.escapes ?? 0),
      catches: Number(stats?.catches ?? 0), missionsCompleted: Number(stats?.missions_completed ?? 0),
    };
  }

  async signOut() {
    const supabase = await getSupabase();
    if (supabase) await supabase.auth.signOut();
    this.session = null;
    this.restored = undefined;
  }
}

export const authManager = new AuthManager();
