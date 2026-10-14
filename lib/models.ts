// All model calls go through Vercel AI Gateway (plain "provider/model" strings).
// Swap here to change models app-wide; see docs/SPEC.md for fallbacks.
export const MODELS = {
  vision: "google/gemini-3.5-flash", // garment detection + tagging
  stylist: "anthropic/claude-sonnet-5.5", // agent / tool calling
  embedding: "openai/text-embedding-3-small", // 1536-d, matches garments.embedding
  imageEdit: "google/gemini-3.1-flash-image", // cutouts + try-on
  outfitImage: "meta/muse-image-1.0",
  realtime: "openai/gpt-realtime-2", // needs a Gateway API key to mint client secrets (OIDC can't)
  transcription: "openai/gpt-4o-mini-transcribe", // voice loop: speech → text
  speech: "openai/tts-1", // voice loop: text → speech
} as const;
