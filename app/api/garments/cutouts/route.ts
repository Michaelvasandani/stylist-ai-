import { after } from "next/server";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db, garments } from "@/lib/db";
import { cutoutGarments } from "@/lib/cutout";
import { getOrCreateUserId } from "@/lib/user";

const inFlight = new Set<string>(); // per instance; stops reloads from queueing the same piece twice

// POST → cut out the current user's pieces that only have a crop (added before cutouts
// existed, or whose cutout failed). Returns the ids being worked on; the client polls.
export async function POST() {
  const userId = await getOrCreateUserId();
  const rows = await db
    .select({ id: garments.id, name: garments.name, colorHex: garments.colorHex, cropUrl: garments.cropUrl })
    .from(garments)
    .where(and(eq(garments.userId, userId), isNull(garments.cutoutUrl), isNotNull(garments.cropUrl)));
  const todo = rows.filter((g) => !inFlight.has(g.id));
  todo.forEach((g) => inFlight.add(g.id));

  after(async () => {
    try {
      const pieces = await Promise.all(
        todo.map(async (g) => ({ ...g, crop: Buffer.from(await (await fetch(g.cropUrl!)).arrayBuffer()) })),
      );
      await cutoutGarments(userId, pieces);
    } finally {
      todo.forEach((g) => inFlight.delete(g.id));
    }
  });
  return Response.json({ ids: rows.map((g) => g.id) });
}
