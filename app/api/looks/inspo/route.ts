import { put } from "@vercel/blob";
import { getOrCreateUserId } from "@/lib/user";

// POST multipart/form-data { photo: File } → { url } of an inspiration photo the stylist can see.
// The chat then carries the URL, not the image bytes, on every turn.
export async function POST(req: Request) {
  const form = await req.formData();
  const photo = form.get("photo");
  if (!(photo instanceof File) || !photo.type.startsWith("image/")) {
    return Response.json({ error: "Attach an image as `photo`." }, { status: 400 });
  }
  if (photo.size > 4 * 1024 * 1024) {
    return Response.json({ error: "Photo is over 4 MB." }, { status: 413 });
  }

  const userId = await getOrCreateUserId();
  const blob = await put(`inspo/${userId}/${crypto.randomUUID()}.jpg`, photo, { access: "public", contentType: photo.type });
  return Response.json({ url: blob.url, mediaType: photo.type });
}
