import { NextResponse, type NextRequest } from "next/server";
import { authUrl, calendarConfigured } from "@/lib/google-calendar";
import { getOrCreateUserId } from "@/lib/user";

const STATE_COOKIE = "gcal_state";

// GET → Google consent screen. ?next=/studio picks where to land afterwards.
export async function GET(req: NextRequest) {
  if (!calendarConfigured()) return NextResponse.json({ error: "Google Calendar isn't configured" }, { status: 501 });
  await getOrCreateUserId(); // make sure the callback has a user to attach the account to

  const next = req.nextUrl.searchParams.get("next");
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authUrl(req.nextUrl.origin, state));
  res.cookies.set(STATE_COOKIE, JSON.stringify({ state, next: next && /^\/[\w/-]*$/.test(next) && !next.startsWith("//") ? next : "/studio" }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/api/calendar",
  });
  return res;
}
