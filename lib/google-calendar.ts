import { eq } from "drizzle-orm";
import { db, googleAccounts } from "@/lib/db";

// Google Calendar over plain OAuth 2.0 + REST: read-only, primary calendar, one account per anonymous user.
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events.readonly"];
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const calendarConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const redirectUri = (origin: string) => `${origin}/api/calendar/callback`;

export function authUrl(origin: string, state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // we want a refresh token
    prompt: "consent", // …every time, or Google only sends it on the first grant
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; id_token?: string; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
  });
  const json: TokenResponse = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? json.error ?? `Google token error ${res.status}`);
  return json;
}

// The id_token came straight from Google's token endpoint over TLS, so reading its payload without verifying is fine.
function emailFromIdToken(idToken?: string) {
  try {
    return idToken ? (JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString()).email as string) : null;
  } catch {
    return null;
  }
}

export async function connectAccount(userId: string, code: string, origin: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });
  if (!t.refresh_token) throw new Error("Google didn't return a refresh token.");
  const row = {
    email: emailFromIdToken(t.id_token),
    refreshToken: t.refresh_token,
    accessToken: t.access_token,
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
  };
  await db.insert(googleAccounts).values({ userId, ...row }).onConflictDoUpdate({ target: googleAccounts.userId, set: row });
}

export async function disconnectAccount(userId: string) {
  const [acct] = await db.delete(googleAccounts).where(eq(googleAccounts.userId, userId)).returning();
  // Best effort: also revoke the grant on Google's side.
  if (acct) await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", body: new URLSearchParams({ token: acct.refreshToken }) }).catch(() => {});
}

export async function getAccount(userId: string) {
  const [acct] = await db.select().from(googleAccounts).where(eq(googleAccounts.userId, userId));
  return acct ?? null;
}

async function accessToken(acct: NonNullable<Awaited<ReturnType<typeof getAccount>>>) {
  if (acct.accessToken && acct.expiresAt && acct.expiresAt.getTime() > Date.now() + 60_000) return acct.accessToken;
  const t = await tokenRequest({ refresh_token: acct.refreshToken, grant_type: "refresh_token" });
  const expiresAt = new Date(Date.now() + t.expires_in * 1000);
  await db.update(googleAccounts).set({ accessToken: t.access_token, expiresAt }).where(eq(googleAccounts.userId, acct.userId));
  return t.access_token;
}

export type CalendarEvent = {
  id: string;
  title: string;
  when: string; // human, in the calendar's time zone: "Thu, Oct 15, 7:00 PM"
  start: string; // ISO, or YYYY-MM-DD for all-day
  end: string;
  allDay: boolean;
  location?: string;
  notes?: string; // description, trimmed (dress codes often live here)
  attendees: number;
};

type GEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  eventType?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

// Events that aren't something you'd get dressed for.
const SKIP_TYPES = new Set(["workingLocation", "outOfOffice", "focusTime"]);

function formatWhen(e: GEvent, timeZone: string) {
  if (e.start.date) {
    const d = new Date(`${e.start.date}T12:00:00Z`);
    return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })} (all day)`;
  }
  return new Date(e.start.dateTime!).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

// Upcoming events on the primary calendar. Returns null when no Google account is linked.
export async function listEvents(userId: string, { days = 7, query, limit = 15 }: { days?: number; query?: string; limit?: number } = {}) {
  const acct = await getAccount(userId);
  if (!acct) return null;

  const now = new Date();
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + days * 86_400_000).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(Math.min(50, limit * 2)),
  });
  if (query) params.set("q", query);

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${await accessToken(acct)}` },
  });
  if (!res.ok) throw new Error(`Google Calendar error ${res.status}`);
  const data: { timeZone?: string; items?: GEvent[] } = await res.json();
  const timeZone = data.timeZone ?? "America/Los_Angeles";

  const events: CalendarEvent[] = (data.items ?? [])
    .filter((e) => e.status !== "cancelled" && !SKIP_TYPES.has(e.eventType ?? ""))
    .filter((e) => e.attendees?.find((a) => a.self)?.responseStatus !== "declined")
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      title: e.summary ?? "(untitled)",
      when: formatWhen(e, timeZone),
      start: e.start.dateTime ?? e.start.date!,
      end: e.end.dateTime ?? e.end.date!,
      allDay: !e.start.dateTime,
      ...(e.location && { location: e.location }),
      ...(e.description && { notes: e.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400) }),
      attendees: e.attendees?.length ?? 0,
    }));

  return { email: acct.email, timeZone, events };
}
