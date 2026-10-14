import { NextResponse, type NextRequest } from "next/server";
import { connectAccount } from "@/lib/google-calendar";
import { getOrCreateUserId } from "@/lib/user";

// Google redirects here with ?code&state (or ?error when the user cancels).
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  let saved: { state?: string; next?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get("gcal_state")?.value ?? "{}");
  } catch {}
  const back = (status: string) => {
    const url = new URL(saved.next ?? "/studio", req.nextUrl.origin);
    url.searchParams.set("calendar", status);
    const res = NextResponse.redirect(url);
    res.cookies.delete({ name: "gcal_state", path: "/api/calendar" });
    return res;
  };

  const code = params.get("code");
  if (!code || !saved.state || params.get("state") !== saved.state) return back(params.get("error") === "access_denied" ? "cancelled" : "error");

  try {
    await connectAccount(await getOrCreateUserId(), code, req.nextUrl.origin);
    return back("connected");
  } catch (e) {
    console.error("Calendar connect failed", e);
    return back("error");
  }
}
