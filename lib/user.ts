import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";

// No auth: each browser gets an anonymous user id in a long-lived cookie (docs/SPEC.md).
const COOKIE = "stylist_uid";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Route handlers only: may create the user and set the cookie.
export async function getOrCreateUserId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing && UUID.test(existing)) {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, existing));
    if (row) return row.id;
  }
  const [user] = await db.insert(users).values({}).returning({ id: users.id });
  jar.set(COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return user.id;
}
