import { after } from "next/server";
import { cutoutGarments } from "@/lib/cutout";
import { ingestWardrobePhoto } from "@/lib/ingest";
import { toGarmentCard } from "@/lib/wardrobe";
import { getOrCreateUserId } from "@/lib/user";

// POST multipart/form-data { photo: File } → the new garments found in it.
// One photo per request; the client fans out multi-select uploads in parallel.
export async function POST(req: Request) {
  const form = await req.formData();
  const photo = form.get("photo");
  if (!(photo instanceof File) || !photo.type.startsWith("image/")) {
    return Response.json({ error: "Attach an image as `photo`." }, { status: 400 });
  }
  if (photo.size > 15 * 1024 * 1024) {
    return Response.json({ error: "Photo is over 15 MB." }, { status: 413 });
  }

  const userId = await getOrCreateUserId();
  try {
    const { added, duplicates, crops } = await ingestWardrobePhoto(userId, Buffer.from(await photo.arrayBuffer()));
    // Cards go back with their crops now; transparent cutouts replace them a few seconds later.
    after(() => cutoutGarments(userId, added.map((g, i) => ({ id: g.id, name: g.name, colorHex: g.colorHex, crop: crops[i] }))));
    return Response.json({ garments: added.map(toGarmentCard), duplicates });
  } catch (e) {
    console.error("ingest failed", e);
    return Response.json({ error: "Couldn't read that photo. Try another one." }, { status: 502 });
  }
}
