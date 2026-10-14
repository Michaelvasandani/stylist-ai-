"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, ImagePlus, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { LookSet, StylistMessage } from "@/lib/stylist/tools";
import { TopBar } from "@/components/shell/top-bar";
import { styleMeFor, UpcomingEvents, useCalendar } from "./calendar";
import { LookBoard } from "./look-board";
import { shrink } from "@/components/wardrobe/use-photo-upload";
import { imagesOf, latestBoard, textOf, toolOf, ToolPart, type ShopOption } from "./parts";
import { useVoiceLoop, type VoiceState } from "./use-voice-loop";

const STARTERS = ["Rooftop dinner in SF tonight", "First day at a new job", "Wedding guest, outdoors, October"];

const STATE_LABEL: Record<VoiceState | "busy", string> = {
  off: "Ready",
  listening: "Listening",
  hearing: "Hearing you",
  thinking: "Thinking",
  speaking: "Speaking · talk to interrupt",
  busy: "Thinking",
};

export function Studio() {
  const [input, setInput] = useState("");
  const [picks, setPicks] = useState<Record<string, ShopOption>>({}); // gap → product tried on the board
  const voiceTurn = useRef(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const transport = useMemo(() => new DefaultChatTransport<StylistMessage>({ api: "/api/chat" }), []);
  const voiceRef = useRef<ReturnType<typeof useVoiceLoop> | null>(null);
  const chat = useChat<StylistMessage>({
    id: "studio", // stable id: a random one would be generated during prerender
    transport,
    onFinish: ({ message }) => {
      if (!voiceTurn.current) return;
      voiceTurn.current = false;
      voiceRef.current?.say(textOf(message));
    },
    onError: (e) => {
      toast.error("The stylist hit a snag", { description: e.message });
      if (voiceTurn.current) {
        voiceTurn.current = false;
        voiceRef.current?.say("Sorry, I lost my train of thought. Could you say that again?");
      }
    },
  });

  const onUtterance = useCallback(
    async (audio: Blob) => {
      const fd = new FormData();
      fd.append("audio", audio, audio.type.includes("mp4") ? "turn.mp4" : "turn.webm");
      const text = await fetch("/api/voice/transcribe", { method: "POST", body: fd })
        .then((r) => r.json())
        .then((d: { text?: string }) => d.text ?? "")
        .catch(() => "");
      if (!text) return voiceRef.current?.listen();
      voiceTurn.current = true;
      chat.sendMessage({ text, metadata: { voice: true } }, { body: { voice: true } });
    },
    [chat],
  );
  const voice = useVoiceLoop({ onUtterance });
  const { cal, disconnect } = useCalendar();
  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  const busy = uploading || chat.status === "submitted" || chat.status === "streaming";
  const { board, shop, inspo } = useMemo(() => latestBoard(chat.messages), [chat.messages]);
  const shopOptions = useMemo(() => new Map([...shop].map(([gap, s]) => [gap, s.options])), [shop]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.messages, voice.state]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    chat.sendMessage({ text }, { body: { voice: voice.state !== "off" } });
    setInput("");
  };

  // "Copy a look": upload the inspiration photo, then hand the stylist its URL.
  const copyLook = async (file: File) => {
    if (busy) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("photo", await shrink(file), "inspo.jpg");
      const res = await fetch("/api/looks/inspo", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Upload failed (${res.status})`);
      const text = input.trim() || "Copy this look for me.";
      chat.sendMessage(
        { text, files: [{ type: "file", mediaType: "image/jpeg", url: json.url, filename: "inspo.jpg" }] },
        { body: { voice: voice.state !== "off" } },
      );
      setInput("");
    } catch (e) {
      toast.error("Couldn't upload that photo", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setUploading(false);
    }
  };
  const pickPhoto = () => photoRef.current?.click();

  const toggleVoice = async () => {
    if (voice.state !== "off") return voice.stop();
    try {
      await voice.start();
      // Open the conversation like walking into a fitting room.
      if (!chat.messages.length) voice.say("Hi, I'm your stylist. What are we dressing for?");
    } catch {
      toast.error("Microphone unavailable", { description: "Allow mic access in your browser to talk to your stylist." });
    }
  };

  const pick = (gap: string, p: ShopOption) => setPicks((cur) => ({ ...cur, [gap]: p }));
  const orbState = voice.state === "off" && busy ? "busy" : voice.state;

  return (
    <>
      <TopBar title="Studio" meta={board ? board.occasion : "New look"}>
        <span className="eyebrow hidden text-taupe xl:block">Vercel · Neon · Shopify · AI Gateway</span>
      </TopBar>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_380px]">
        <Canvas
          board={board}
          picks={picks}
          shop={shopOptions}
          onPick={pick}
          onSave={(names) => send(`Save this look as it is on my board now: ${names.join(", ")}.`)}
          onStarter={send}
          onCopyLook={pickPhoto}
          inspo={inspo}
          busy={busy}
          upcoming={<UpcomingEvents cal={cal} busy={busy} onPick={(e) => send(styleMeFor(e))} onDisconnect={disconnect} className="mt-8" />}
        />

        <aside className="flex min-h-0 flex-col border-line bg-paper lg:border-l">
          <div className="flex items-center gap-3.5 border-b border-line px-5 py-4">
            <Orb state={orbState} level={voice.level} />
            <div>
              <p className="font-normal">Stylist</p>
              <p className="eyebrow text-taupe">{STATE_LABEL[orbState]}</p>
            </div>
          </div>

          <div ref={threadRef} className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
            {!chat.messages.length && (
              <>
                <p className="font-serif text-[19px] leading-snug text-taupe">
                  Tell me where you&apos;re going, or tap the mic and just talk. I&apos;ll build it from what you own and only shop the gaps.
                </p>
                {/* Phones have no canvas, so the calendar sits in the thread. */}
                <UpcomingEvents cal={cal} busy={busy} onPick={(e) => send(styleMeFor(e))} onDisconnect={disconnect} className="lg:hidden" />
              </>
            )}
            {chat.messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="max-w-[88%] self-end bg-ink px-3.5 py-3 font-serif text-[17px] italic leading-tight text-bone">
                    <span className="eyebrow mb-1.5 block font-sans not-italic text-[#9b8f80]">{m.metadata?.voice ? "Voice" : "You"}</span>
                    {imagesOf(m).map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element -- inspiration photo from Blob
                      <img key={url} src={url} alt="Look to copy" className="mb-2 max-h-56 w-full object-cover" />
                    ))}
                    {textOf(m)}
                  </div>
              ) : (
                <div key={m.id} className="flex flex-col gap-2.5">
                  {m.parts.map((p, i) => {
                    if (p.type === "text") return p.text.trim() && <p key={i} className="whitespace-pre-wrap font-serif text-[19px] leading-[1.35]">{p.text}</p>;
                    const t = toolOf(p);
                    if (!t) return null;
                    const gap = (t.input as { gap?: string } | undefined)?.gap;
                    return (
                      <ToolPart
                        key={i}
                        tool={t}
                        onPick={pick}
                        onMore={busy ? undefined : (g) => send(`Not quite. Show me 3 more options for the ${g}.`)}
                        onAnswer={busy || m.id !== chat.messages.at(-1)?.id ? undefined : send}
                        picked={gap ? picks[gap]?.id : undefined}
                      />
                    );
                  })}
                </div>
              ),
            )}
            {uploading && <p className="font-serif text-[19px] italic text-taupe">Pinning up your inspiration…</p>}
            {busy && chat.messages.at(-1)?.role === "user" && <p className="font-serif text-[19px] italic text-taupe">…</p>}
            {voice.state === "hearing" && <p className="font-serif text-[22px] italic text-ink after:animate-pulse after:text-gold after:content-['▍']">Listening</p>}
            {voice.state === "thinking" && !busy && <p className="font-serif text-[19px] italic text-taupe">Got it…</p>}
          </div>

          <form
            className="flex items-center gap-1.5 border-t border-line px-4 pb-24 pt-3.5 lg:pb-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) copyLook(f);
              }}
            />
            <button
              type="button"
              onClick={pickPhoto}
              disabled={busy}
              aria-label="Copy a look from a photo"
              title="Copy a look from a photo"
              className="grid size-9 shrink-0 place-items-center rounded-full text-taupe hover:bg-sand hover:text-ink disabled:opacity-40"
            >
              <ImagePlus className="size-[18px]" strokeWidth={1.4} />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={voice.state === "off" ? "Ask, or tap the mic to talk" : "Talking… or type here"}
              className="h-10 min-w-0 flex-1 bg-transparent font-serif text-[17px] italic outline-none placeholder:text-taupe"
            />
            {input.trim() && (
              <button type="submit" disabled={busy} aria-label="Send" className="grid size-9 place-items-center rounded-full text-taupe hover:bg-sand hover:text-ink disabled:opacity-40">
                <ArrowUp className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={toggleVoice}
              aria-label={voice.state === "off" ? "Talk to your stylist" : "End voice conversation"}
              className={cn("grid size-11 place-items-center rounded-full bg-ink text-bone transition-colors", voice.state !== "off" && "bg-gold text-ink")}
            >
              {voice.state === "off" ? <Mic className="size-[18px]" strokeWidth={1.4} /> : <MicOff className="size-[18px]" strokeWidth={1.4} />}
            </button>
          </form>
        </aside>
      </div>
    </>
  );
}

function Orb({ state, level }: { state: VoiceState | "busy"; level: number }) {
  const live = state === "listening" || state === "hearing";
  return (
    <span
      className={cn(
        "size-10 shrink-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,#f6e8c6,#c9a24a_45%,#5e481d_100%)] transition-[box-shadow,transform] duration-100",
        (state === "off" || state === "listening") && "animate-[breathe_4s_ease-in-out_infinite]",
        (state === "thinking" || state === "busy") && "animate-pulse",
        state === "speaking" && "animate-[breathe_0.9s_ease-in-out_infinite]",
      )}
      style={
        live
          ? { transform: `scale(${1 + level * 0.25})`, boxShadow: `0 0 0 ${6 + level * 10}px rgba(201,162,74,.18), 0 0 0 ${12 + level * 16}px rgba(201,162,74,.07)` }
          : undefined
      }
    />
  );
}

function Canvas({
  board,
  picks,
  shop,
  onPick,
  onSave,
  onStarter,
  onCopyLook,
  inspo,
  busy,
  upcoming,
}: {
  board: LookSet | null;
  picks: Record<string, ShopOption>;
  shop: Map<string, ShopOption[]>;
  onPick: (gap: string, p: ShopOption) => void;
  onSave: (names: string[]) => void;
  onStarter: (t: string) => void;
  onCopyLook: () => void;
  inspo: string | null;
  busy: boolean;
  upcoming: React.ReactNode;
}) {
  return (
    <section className="relative m-5 hidden min-h-0 flex-col overflow-y-auto bg-sand bg-[radial-gradient(rgba(28,26,23,.07)_1px,transparent_1px)] bg-[length:22px_22px] p-6 pb-24 lg:flex">
      {!board ? (
        <div className="m-auto max-w-md text-center">
          <p className="eyebrow text-taupe">Your board</p>
          <p className="mt-3 font-serif text-3xl italic leading-tight">Where are you headed?</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {STARTERS.map((s) => (
              <button key={s} disabled={busy} onClick={() => onStarter(s)} className="btn-chic btn-ghost btn-sm bg-paper normal-case tracking-normal text-[13px]">
                {s}
              </button>
            ))}
            <button disabled={busy} onClick={onCopyLook} className="btn-chic btn-sm normal-case tracking-normal text-[13px]">
              <ImagePlus className="size-3.5" strokeWidth={1.6} /> Copy a look
            </button>
          </div>
          {upcoming}
        </div>
      ) : (
        <>
          {inspo && (
            <figure className="absolute bottom-24 right-6 z-10 w-24 rotate-[3deg] bg-paper p-1.5 pb-2 shadow-[0_8px_20px_rgba(60,45,30,.18)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- inspiration photo from Blob */}
              <img src={inspo} alt="The look you're copying" className="aspect-[3/4] w-full object-cover" />
              <figcaption className="eyebrow mt-1.5 text-center text-taupe">Inspiration</figcaption>
            </figure>
          )}
          <LookBoard
            key={board.looks.map((l) => l.title).join()}
            set={board}
            shop={shop}
            picks={picks}
            onPick={onPick}
            onSave={onSave}
            busy={busy}
          />
        </>
      )}
    </section>
  );
}
