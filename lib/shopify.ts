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

async function callTool<T>(name: string, catalog: Record<string, unknown>): Promise<T> {
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
  };
}

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
