import { hasOpenAIApiKey } from "@/features/ai";

export function ContextPanel({
  projectId,
  title = "Context / Analysis",
  children,
}: {
  projectId: string;
  title?: string;
  children?: React.ReactNode;
}) {
  void projectId;
  const keyed = hasOpenAIApiKey();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted">
          Advisory only. AI never silently changes project data.
        </p>
      </div>
      <div className="space-y-4 p-4 text-sm">
        {children}
        <div className="rounded-[var(--radius)] border border-dashed border-border bg-panel px-3 py-3 text-xs text-muted">
          <p className="font-semibold text-foreground">AI services (Phase 2)</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>analyzeReadyNode / classifyNode / summarize*</li>
            <li>suggestSetupFromIntent (setup wizard)</li>
            <li>analyzeImbalance (Phase 3 stub)</li>
            <li>improvement / direction / quick project reanalysis (later)</li>
          </ul>
          <p className="mt-3">
            OpenAI key:{" "}
            <span className="text-foreground">
              {keyed ? "configured (server)" : "missing — Ready analysis deferred"}
            </span>
            . Mark a node Ready to run selective analysis.
          </p>
        </div>
      </div>
    </div>
  );
}
