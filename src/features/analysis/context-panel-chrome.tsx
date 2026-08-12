"use client";

import { useT } from "@/features/i18n";

/** Client chrome for Context / Analysis rail (server parent checks API key). */
export function ContextPanelChrome({
  keyed,
  children,
  title,
}: {
  keyed: boolean;
  children?: React.ReactNode;
  title?: string;
}) {
  const t = useT();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title ?? t("analysis.title")}</h2>
        <p className="mt-1 text-xs text-muted">{t("analysis.advisory")}</p>
      </div>
      <div className="space-y-4 p-4 text-sm">
        {children}
        <div className="rounded-[var(--radius)] border border-dashed border-border bg-panel px-3 py-3 text-xs text-muted">
          <p className="font-semibold text-foreground">{t("analysis.aiServices")}</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>{t("analysis.serviceReady")}</li>
            <li>{t("analysis.serviceSetup")}</li>
            <li>{t("analysis.serviceImbalance")}</li>
            <li>{t("analysis.serviceLater")}</li>
          </ul>
          <p className="mt-3">
            {t("analysis.openaiKey")}{" "}
            <span className="text-foreground">
              {keyed ? t("analysis.keyConfigured") : t("analysis.keyMissing")}
            </span>
            . {t("analysis.readyTip")}
          </p>
        </div>
      </div>
    </div>
  );
}
