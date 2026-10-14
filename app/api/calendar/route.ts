import { calendarConfigured, disconnectAccount, listEvents } from "@/lib/google-calendar";
import { getOrCreateUserId } from "@/lib/user";

// GET → { configured, connected, email?, events? } for the next week.
export async function GET() {
  if (!calendarConfigured()) return Response.json({ configured: false, connected: false });
  const userId = await getOrCreateUserId();
  try {
    const cal = await listEvents(userId, { days: 7, limit: 8 });
    if (!cal) return Response.json({ configured: true, connected: false });
    return Response.json({ configured: true, connected: true, email: cal.email, events: cal.events });
  } catch (e) {
    // Most likely the user revoked access in their Google account.
    console.error("Calendar fetch failed", e);
    return Response.json({ configured: true, connected: true, error: "Couldn't reach Google Calendar", events: [] });
  }
}

export async function DELETE() {
  await disconnectAccount(await getOrCreateUserId());
  return Response.json({ connected: false });
}
