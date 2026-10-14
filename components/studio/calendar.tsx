"use client";

import { useEffect, useState } from "react";
import { CalendarDays, MapPin } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/google-calendar";

type CalendarState = { configured: boolean; connected: boolean; email?: string | null; events?: CalendarEvent[]; error?: string };

const RESULT_TOAST: Record<string, () => void> = {
  connected: () => toast.success("Google Calendar connected", { description: "Your stylist can now dress you for what's coming up." }),
  cancelled: () => toast("Calendar not connected"),
  error: () => toast.error("Couldn't connect Google Calendar", { description: "Please try again." }),
};

export function useCalendar() {
  const [cal, setCal] = useState<CalendarState | null>(null);

  useEffect(() => {
    // Back from Google's consent screen: say how it went, then tidy the URL.
    const url = new URL(window.location.href);
    const result = url.searchParams.get("calendar");
    if (result) {
      RESULT_TOAST[result]?.();
      url.searchParams.delete("calendar");
      window.history.replaceState(null, "", url);
    }
    fetch("/api/calendar")
      .then((r) => r.json())
      .then(setCal)
      .catch(() => setCal({ configured: false, connected: false }));
  }, []);

  const disconnect = async () => {
    await fetch("/api/calendar", { method: "DELETE" });
    setCal((c) => c && { ...c, connected: false, events: [], email: undefined });
  };

  return { cal, disconnect };
}

export const styleMeFor = (e: CalendarEvent) => `Style me for "${e.title}", ${e.when}${e.location ? `, at ${e.location}` : ""}.`;

// "Coming up" list with one-tap styling, or a connect button. Hidden entirely when OAuth isn't configured.
export function UpcomingEvents({
  cal,
  onPick,
  onDisconnect,
  busy,
  className,
}: {
  cal: CalendarState | null;
  onPick: (e: CalendarEvent) => void;
  onDisconnect: () => void;
  busy: boolean;
  className?: string;
}) {
  if (!cal?.configured) return null;

  if (!cal.connected)
    return (
      <div className={cn("flex flex-col items-center gap-2 text-center", className)}>
        <a href="/api/calendar/connect?next=/studio" className="btn-chic btn-ghost btn-sm gap-2 bg-paper">
          <CalendarDays className="size-3.5" strokeWidth={1.5} />
          Connect Google Calendar
        </a>
        <p className="text-xs text-taupe">So I can dress you for what&apos;s coming up.</p>
      </div>
    );

  const events = cal.events ?? [];
  return (
    <div className={cn("text-left", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow text-taupe">Coming up{cal.email ? ` · ${cal.email}` : ""}</p>
        <button onClick={onDisconnect} className="eyebrow text-taupe hover:text-ink">
          Disconnect
        </button>
      </div>
      {cal.error ? (
        <p className="mt-3 font-serif text-lg italic text-taupe">{cal.error}. Try reconnecting.</p>
      ) : !events.length ? (
        <p className="mt-3 font-serif text-lg italic text-taupe">Nothing on your calendar this week.</p>
      ) : (
        <ul className="mt-2.5 flex flex-col divide-y divide-line border-y border-line">
          {events.map((e) => (
            <li key={e.id}>
              <button
                disabled={busy}
                onClick={() => onPick(e)}
                className="group flex w-full items-center justify-between gap-4 py-2.5 text-left disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-serif text-[17px] leading-tight">{e.title}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-taupe">
                    {e.when}
                    {e.location && (
                      <>
                        <MapPin className="size-3 shrink-0" strokeWidth={1.5} />
                        <span className="truncate">{e.location}</span>
                      </>
                    )}
                  </span>
                </span>
                <span className="eyebrow shrink-0 text-taupe group-hover:text-ink">Style me</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
