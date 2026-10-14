import { gateway, transcribe } from "ai";
import { MODELS } from "@/lib/models";

// POST multipart { audio: Blob } → { text }. One utterance from the voice loop.
export async function POST(req: Request) {
  const audio = (await req.formData()).get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: "Attach a recording as `audio`." }, { status: 400 });
  }
  if (audio.size > 10 * 1024 * 1024) return Response.json({ error: "Recording is too long." }, { status: 413 });

  try {
    const { text } = await transcribe({
      model: gateway.transcription(MODELS.transcription),
      audio: new Uint8Array(await audio.arrayBuffer()),
    });
    return Response.json({ text: text.trim() });
  } catch (e) {
    console.error("transcribe failed", e);
    return Response.json({ error: "Couldn't hear that." }, { status: 502 });
  }
}
