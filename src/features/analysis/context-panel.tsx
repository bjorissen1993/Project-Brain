import { hasOpenAIApiKey } from "@/features/ai";
import { ContextPanelChrome } from "./context-panel-chrome";

export function ContextPanel({
  projectId,
  title,
  children,
}: {
  projectId: string;
  title?: string;
  children?: React.ReactNode;
}) {
  void projectId;
  const keyed = hasOpenAIApiKey();

  return (
    <ContextPanelChrome keyed={keyed} title={title}>
      {children}
    </ContextPanelChrome>
  );
}
