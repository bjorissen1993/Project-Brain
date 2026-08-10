import { Suspense } from "react";
import { FocusSpaceView } from "@/features/focus-space";

export default function FocusSpaceRootPage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 py-8 text-sm text-muted">Loading structure…</div>
      }
    >
      <FocusSpaceView nodeId={null} />
    </Suspense>
  );
}
