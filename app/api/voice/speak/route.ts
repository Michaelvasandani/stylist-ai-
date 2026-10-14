import { gateway, generateSpeech } from "ai";
import { MODELS } from "@/lib/models";

// POST { text } → audio/mpeg of the stylist saying it.
export async function POST(req: Request) {
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  if (!text?.trim()) return Response.json({ error: "Nothing to say." }, { status: 400 });

  try {
    const { audio } = await generateSpeech({
      model: gateway.speech(MODELS.speech),
      text: text.slice(0, 1500),
      voice: "nova",
      speed: 1.05,
    });
    return new Response(Buffer.from(audio.uint8Array), {
      headers: { "content-type": audio.mediaType ?? "audio/mpeg", "cache-control": "no-store" },
    });
  } catch (e) {
    console.error("speak failed", e);
    return Response.json({ error: "Couldn't speak that." }, { status: 502 });
  }
}
