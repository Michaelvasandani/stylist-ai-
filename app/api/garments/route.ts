import { CATEGORIES } from "@/lib/vision";
import { getOrCreateUserId } from "@/lib/user";
import { searchWardrobe } from "@/lib/wardrobe";

// GET /api/garments?q=something+warm&category=top → the current user's wardrobe.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const category = params.get("category") as (typeof CATEGORIES)[number] | null;
  const userId = await getOrCreateUserId();
  const garments = await searchWardrobe(userId, {
    query: params.get("q") ?? undefined,
    category: category && CATEGORIES.includes(category) ? category : undefined,
  });
  return Response.json({ garments });
}
