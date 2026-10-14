import { redirect } from "next/navigation";

// Wardrobe moved to "/"; keep old links working.
export default function WardrobeRedirect() {
  redirect("/");
}
