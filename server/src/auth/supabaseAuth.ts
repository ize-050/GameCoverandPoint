import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  picture: string;
  provider: "google";
}

export interface MatchResultRecord {
  matchId: string;
  userId: string;
  score: number;
  xpEarned: number;
  coinsEarned: number;
  hiderWins: number;
  seekerWins: number;
  escapes: number;
  catches: number;
  missionsCompleted: number;
}

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";
const options = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const authClient: SupabaseClient | null = supabaseUrl && publishableKey ? createClient(supabaseUrl, publishableKey, options) : null;
const adminClient: SupabaseClient | null = supabaseUrl && secretKey ? createClient(supabaseUrl, secretKey, options) : null;

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    displayName: String(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Employee").slice(0, 40),
    email: user.email ?? "",
    picture: String(user.user_metadata?.avatar_url || user.user_metadata?.picture || ""),
    provider: "google",
  };
}

export async function verifySupabaseAccessToken(token: string): Promise<AuthUser | null> {
  if (!authClient || !token) return null;
  const { data, error } = await authClient.auth.getUser(token);
  return error || !data.user ? null : toAuthUser(data.user);
}

export async function persistMatchResults(records: MatchResultRecord[]): Promise<Set<string>> {
  const savedUserIds = new Set<string>();
  if (!adminClient || records.length === 0) return savedUserIds;
  const results = await Promise.all(records.map((record) => adminClient.rpc("record_match_result", {
    p_match_id: record.matchId,
    p_user_id: record.userId,
    p_score: record.score,
    p_xp_earned: record.xpEarned,
    p_coins_earned: record.coinsEarned,
    p_hider_wins: record.hiderWins,
    p_seeker_wins: record.seekerWins,
    p_escapes: record.escapes,
    p_catches: record.catches,
    p_missions_completed: record.missionsCompleted,
  })));
  results.forEach(({ error, data }, index) => {
    if (error) console.error(`Failed to persist match result for ${records[index].userId}:`, error.message);
    else if (data !== false) savedUserIds.add(records[index].userId);
  });
  return savedUserIds;
}

export function getSupabaseStatus() {
  return { authConfigured: Boolean(authClient), persistenceConfigured: Boolean(adminClient) };
}
