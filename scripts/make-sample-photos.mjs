// Generates realistic sample wardrobe photos (via AI Gateway) for testing ingest and seeding the demo.
// Usage: node scripts/make-sample-photos.mjs [outDir]
import { config } from "dotenv";
import { generateText } from "ai";
import { mkdirSync, writeFileSync } from "node:fs";

config({ path: ".env.local" });
const out = process.argv[2] ?? "samples";
mkdirSync(out, { recursive: true });

const SHOTS = {
  "mirror-1": "Full-body mirror selfie of a man in a bright minimal apartment, holding a phone. He wears a navy linen overshirt open over a white crew-neck tee, black tapered chinos, tobacco suede penny loafers, and a thin gold chain necklace. Natural daylight, photorealistic, sharp.",
  "flatlay-1": "Overhead flat lay on a pale oak floor of separate clothing items, neatly spaced and not overlapping: an oatmeal merino crewneck sweater, light-wash straight jeans, white leather court sneakers, a tan leather tote bag, tortoiseshell oval sunglasses, and a dark brown leather belt. Soft daylight, photorealistic.",
};

await Promise.all(
  Object.entries(SHOTS).map(async ([name, prompt]) => {
    const { files } = await generateText({ model: "google/gemini-3.1-flash-image", prompt });
    const img = files.find((f) => f.mediaType.startsWith("image/"));
    if (!img) throw new Error(`no image for ${name}`);
    const ext = img.mediaType.split("/")[1].replace("jpeg", "jpg");
    writeFileSync(`${out}/${name}.${ext}`, img.uint8Array);
    console.log(`wrote ${out}/${name}.${ext}`);
  }),
);
