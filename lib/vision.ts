import { generateText, Output } from "ai";
import { z } from "zod";
import { MODELS } from "@/lib/models";

export const CATEGORIES = ["top", "bottom", "outerwear", "dress", "shoes", "accessory"] as const;
export const ACCESSORY_TYPES = ["bag", "necklace", "earrings", "glasses", "ring", "hat", "belt", "watch", "scarf", "other"] as const;

const detectedItem = z.object({
  name: z.string().describe('Short retail-style name, e.g. "Navy linen overshirt"'),
  category: z.enum(CATEGORIES),
  subcategory: z
    .string()
    .describe(`Garment type, e.g. "overshirt", "chinos", "sneakers". For accessories use one of: ${ACCESSORY_TYPES.join(", ")}`),
  colors: z.array(z.string()).describe("Colour names, dominant first, e.g. [\"navy\"]"),
  colorHex: z.string().describe("Hex of the dominant colour, e.g. #2f3e5c"),
  pattern: z.string().describe('"solid", "striped", "plaid", "floral"…'),
  material: z.string().describe('Best guess, e.g. "linen", "denim", "leather"'),
  formality: z.number().int().describe("1 lounge, 2 casual, 3 smart casual, 4 business, 5 black tie"),
  warmth: z.number().int().describe("1 very light … 5 very warm"),
  seasons: z.array(z.enum(["spring", "summer", "fall", "winter"])),
  styleTags: z.array(z.string()).describe('2-4 tags, e.g. "minimal", "streetwear", "preppy"'),
  box: z.array(z.number()).describe("Bounding box [ymin, xmin, ymax, xmax], each normalised to 0-1000"),
  sameAs: z
    .string()
    .describe("If this is the same physical piece as one in the owned list, its id. Otherwise an empty string."),
});

export type DetectedItem = Omit<z.infer<typeof detectedItem>, "box" | "sameAs"> & {
  bbox: { x: number; y: number; w: number; h: number }; // 0-1 fractions of the image
  sameAs: string | null; // id of an owned garment this is a repeat of
};

export type OwnedPiece = { id: string; name: string; category: string };

const PROMPT = `You are a fashion cataloguer. List every distinct clothing item, pair of shoes and accessory that is clearly visible in this photo.
- One entry per physical item. A pair of shoes or earrings is one item, and its box covers both.
- If the same item appears more than once (mirror reflections, collages, several shots of one outfit), list it once, using its clearest view.
- Ignore items that are mostly hidden or cut off, and ignore the phone in a mirror selfie.
- The box must tightly enclose just that item, excluding the face where possible.
- Names read like a product listing: colour + material/detail + type.`;

const clamp = (n: number) => Math.min(1, Math.max(0, n));

// `owned` lets the model recognise pieces already in the wardrobe, so re-photographed
// items aren't added twice (names vary run to run, so embeddings alone miss some).
export async function detectGarments(image: Buffer, owned: OwnedPiece[] = []): Promise<DetectedItem[]> {
  const ownedIds = new Set(owned.map((o) => o.id));
  const ownedList = owned.length
    ? `\n\nAlready owned (id · category · name):\n${owned.map((o) => `${o.id} · ${o.category} · ${o.name}`).join("\n")}\nStill list every item you see, but set sameAs when one is clearly the same piece (same type, colour and material).`
    : "";
  const { output } = await generateText({
    model: MODELS.vision,
    output: Output.object({ schema: z.object({ items: z.array(detectedItem) }) }),
    providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT + ownedList },
          { type: "file", mediaType: "image/jpeg", data: image },
        ],
      },
    ],
  });

  return output.items.flatMap(({ box, sameAs, ...item }) => {
    if (box.length !== 4) return [];
    const [ymin, xmin, ymax, xmax] = box.map((v) => clamp(v / 1000));
    if (xmax <= xmin || ymax <= ymin) return [];
    return [
      {
        ...item,
        formality: Math.min(5, Math.max(1, Math.round(item.formality))),
        warmth: Math.min(5, Math.max(1, Math.round(item.warmth))),
        bbox: { x: xmin, y: ymin, w: xmax - xmin, h: ymax - ymin },
        sameAs: ownedIds.has(sameAs) ? sameAs : null,
      },
    ];
  });
}

// Text we embed for semantic wardrobe search ("something warm and cozy").
export function describeForEmbedding(g: {
  name: string;
  category: string;
  subcategory?: string | null;
  colors: string[];
  material?: string | null;
  pattern?: string | null;
  styleTags: string[];
  seasons: string[];
  warmth?: number | null;
  formality?: number | null;
}) {
  const warmth = ["", "very light", "light", "mid-weight", "warm", "very warm and cozy"][g.warmth ?? 0] ?? "";
  const formality = ["", "loungewear", "casual", "smart casual", "business", "black tie"][g.formality ?? 0] ?? "";
  return [
    g.name,
    `${g.subcategory ?? ""} ${g.category}`.trim(),
    g.colors.length && `colour: ${g.colors.join(", ")}`,
    g.material && `material: ${g.material}`,
    g.pattern && g.pattern !== "solid" && `pattern: ${g.pattern}`,
    warmth,
    formality,
    g.seasons.length && `seasons: ${g.seasons.join(", ")}`,
    g.styleTags.length && `style: ${g.styleTags.join(", ")}`,
  ]
    .filter(Boolean)
    .join(". ");
}
