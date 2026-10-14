import { and, eq } from "drizzle-orm";
import { db, garments } from "@/lib/db";
import { getOrCreateUserId } from "@/lib/user";

// DELETE /api/garments/:id — remove a piece the AI got wrong (or the user no longer owns).
export async function DELETE(_req: Request, ctx: RouteContext<"/api/garments/[id]">) {
  const { id } = await ctx.params;
  const userId = await getOrCreateUserId();
  const deleted = await db
    .delete(garments)
    .where(and(eq(garments.id, id), eq(garments.userId, userId)))
    .returning({ id: garments.id });
  if (!deleted.length) return Response.json({ error: "Not found" }, { status: 404 });
  return new Response(null, { status: 204 });
}
