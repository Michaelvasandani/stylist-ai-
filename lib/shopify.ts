// Thin client for Shopify's Global Catalog MCP (UCP). JSON-RPC over HTTP, no API key;
// every call carries our agent profile URL.
const ENDPOINT = "https://catalog.shopify.com/api/ucp/mcp";
const AGENT_PROFILE =
  process.env.UCP_AGENT_PROFILE ??
  "https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/valid-with-capabilities.json";

type Money = { amount: number; currency: string };

export type ShopProduct = {
  id: string;
  title: string;
  imageUrl?: string;
  price?: Money;
  checkoutUrl?: string;
  seller?: string;
  sellerUrl?: string;
  rating?: number;
  variantId?: string;
  options?: { name: string; values: string[] }[]; // e.g. Size: ["Small (S)", "Medium (M)"]
  selected?: { name: string; label: string }[]; // what get_product actually matched, echoed back
};

export type SearchInput = {
  query?: string;
  imageUrl?: string; // visual similarity (fetched and sent inline as base64)
  likeProductId?: string; // "more like this" for a catalog gid
  maxPriceCents?: number;
  minPriceCents?: number;
  colors?: string[];
  sizes?: string[];
  gender?: string;
  intent?: string;
  limit?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The catalog rate-limits bursts (about one call a second) and says how long to wait.
async function callTool<T>(name: string, catalog: Record<string, unknown>, attempt = 0): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: { name, arguments: { meta: { "ucp-agent": { profile: AGENT_PROFILE } }, catalog } },
    }),
  });
  if (!res.ok) throw new Error(`Shopify catalog ${name} failed: ${res.status}`);
  const json = await res.json();
  if (json.error?.message === "Rate limit exceeded" && attempt < 4) {
    await sleep(1000 * (json.error.data?.retry_after ?? 1) + 250 * attempt);
    return callTool(name, catalog, attempt + 1);
  }
  if (json.error) throw new Error(`Shopify catalog ${name}: ${json.error.message}`);
  return json.result.structuredContent as T;
}

// Raw UCP product shape (only the fields we use).
type RawProduct = {
  id: string;
  title: string;
  media?: { type: string; url: string }[];
  price_range?: { min: Money };
  rating?: { value: number };
  options?: { name: string; values?: { label: string }[] }[];
  selected?: { name: string; label: string }[];
  variants?: {
    id: string;
    price?: Money;
    checkout_url?: string;
    seller?: { name: string; url: string };
  }[];
};

function toCard(p: RawProduct): ShopProduct {
  const v = p.variants?.[0];
  return {
    id: p.id,
    title: p.title,
    imageUrl: p.media?.find((m) => m.type === "image")?.url,
    price: v?.price ?? p.price_range?.min,
    checkoutUrl: v?.checkout_url,
    seller: v?.seller?.name,
    sellerUrl: v?.seller?.url,
    rating: p.rating?.value,
    variantId: v?.id,
    options: p.options?.map((o) => ({ name: o.name, values: (o.values ?? []).map((x) => x.label) })),
    selected: p.selected,
  };
}

// Stores label sizes their own way ("M", "Medium", "Medium (M)", "US 9", "9 US", "32 x 30"),
// and get_product only selects on an exact label, so map the user's size onto the product's.
const SIZE_WORDS: Record<string, string> = {
  "extra extra small": "xxs", "extra small": "xs", small: "s", medium: "m", large: "l",
  "extra large": "xl", "double extra large": "xxl", "extra extra large": "xxl", "2xl": "xxl",
  "triple extra large": "xxxl", "3xl": "xxxl", "one size": "os", "one size fits all": "os",
};
function sizeKeys(label: string) {
  const l = label.toLowerCase().trim();
  const inParens = l.match(/\(([^)]+)\)/)?.[1];
  return [l, l.replace(/\s*\([^)]*\)/, ""), inParens].flatMap((x) => {
    if (!x) return [];
    const bare = x.replace(/\b(us|uk|eu|size|men'?s|women'?s)\b/g, "").replace(/\s*[x×/]\s*/g, "x").replace(/\.0\b/, "").trim();
    return [bare, SIZE_WORDS[bare] ?? bare];
  });
}
export function matchOption(options: ShopProduct["options"], name: RegExp, wanted: string) {
  const values = options?.find((o) => name.test(o.name))?.values;
  if (!values) return undefined;
  const want = new Set(sizeKeys(wanted));
  return values.find((v) => sizeKeys(v).some((k) => want.has(k))) ?? null; // null: has the option, not this value
}
export const SIZE = /^size$/i;
export const COLOR = /^colou?r$/i;

async function inlineImage(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch image for similarity search: ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer()).toString("base64");
  return { content_type: res.headers.get("content-type") ?? "image/jpeg", data };
}

export async function searchCatalog(input: SearchInput): Promise<ShopProduct[]> {
  const attributes = [
    input.colors?.length && { name: "Color", values: input.colors },
    input.sizes?.length && { name: "Size", values: input.sizes },
    input.gender && { name: "Target gender", values: [input.gender] },
  ].filter(Boolean);

  const catalog: Record<string, unknown> = {
    context: { address_country: "US", ...(input.intent && { intent: input.intent }) },
    filters: {
      available: true,
      ships_to: { country: "US" },
      ...((input.maxPriceCents || input.minPriceCents) && {
        price: { min: input.minPriceCents, max: input.maxPriceCents },
      }),
      ...(attributes.length && { attributes }),
    },
    pagination: { limit: input.limit ?? 6 },
  };
  if (input.query) catalog.query = input.query;
  // Visual similarity: pass the image alone, or with a query for multimodal search.
  if (input.imageUrl) catalog.like = [{ image: await inlineImage(input.imageUrl) }];
  else if (input.likeProductId) catalog.like = [{ id: input.likeProductId }];

  const out = await callTool<{ products?: RawProduct[] }>("search_catalog", catalog);
  return (out.products ?? []).map(toCard);
}

export async function getProduct(
  id: string,
  selected?: { name: string; label: string }[],
): Promise<ShopProduct> {
  const out = await callTool<{ product: RawProduct }>("get_product", {
    id,
    ...(selected && { selected }),
    context: { address_country: "US" },
  });
  return toCard(out.product);
}
