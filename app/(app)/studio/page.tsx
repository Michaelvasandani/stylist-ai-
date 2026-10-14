import { Suspense } from "react";
import { Studio } from "@/components/studio/studio";

// The chat client creates random ids, so render it per request rather than at prerender.
export default function StudioPage() {
  return (
    <Suspense>
      <Studio />
    </Suspense>
  );
}
