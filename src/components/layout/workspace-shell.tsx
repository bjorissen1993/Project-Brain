"use client";

import { Suspense, useEffect, useId, useState } from "react";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { ShellNav } from "@/components/layout/shell-nav";
import { StructureShellBreadcrumbs } from "@/components/layout/structure-shell-breadcrumbs";
import { ChatDrawer, ChatPanelProvider, useChatPanel } from "@/features/chat";
import { useT } from "@/features/i18n";
import { cn } from "@/lib/utils";

const SIDEBAR_STORAGE_KEY = "pb:projects-sidebar-collapsed";

function readSidebarCollapsed() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function WorkspaceShellInner({
  projectName,
  projectId,
  sidebar,
  context,
  children,
}: {
  projectName: string;
  projectId: string;
  sidebar: React.ReactNode;
  context?: React.ReactNode;
  children: React.ReactNode;
}) {
  const chat = useChatPanel();
  const t = useT();
  const pathname = usePathname() ?? "";
  const contextSheetId = useId();
  const lockMainScroll =
    /\/board(\/|$)/.test(pathname) || /\/graph(\/|$)/.test(pathname);
  // Constant for SSR + first client paint; restore localStorage after mount.
  const [collapsed, setCollapsed] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCollapsed(readSidebarCollapsed());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setContextOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!contextOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [contextOpen]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  const focusRing =
    "outline-none focus-visible:ring-2 focus-visible:ring-nav/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel";

  return (
    <div className="flex h-dvh flex-col overflow-x-clip bg-background text-foreground safe-pt">
      <div className="safe-px flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-border/80 bg-panel px-3 py-2.5 sm:gap-x-4 sm:px-4 sm:py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn(
              "hidden h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted transition-colors hover:bg-muted-bg hover:text-foreground lg:inline-flex",
              focusRing,
            )}
            aria-label={
              collapsed
                ? t("shell.expandSidebar")
                : t("shell.collapseSidebar")
            }
            aria-expanded={!collapsed}
            title={
              collapsed
                ? t("shell.expandProjects")
                : t("shell.collapseProjects")
            }
          >
            {collapsed ? (
              <PanelLeftOpen size={18} strokeWidth={2} aria-hidden />
            ) : (
              <PanelLeftClose size={18} strokeWidth={2} aria-hidden />
            )}
          </button>
          <BrandMark variant="lockup" className="min-w-0 shrink-0" />
          {/* Mobile: project name only — full Structure path on lg+ */}
          <span className="truncate text-sm font-medium text-muted lg:hidden">
            {projectName}
          </span>
          <div className="hidden min-w-0 items-center gap-2 lg:flex">
            <Suspense
              fallback={
                <span className="truncate text-sm font-medium text-foreground">
                  {projectName}
                </span>
              }
            >
              <StructureShellBreadcrumbs
                projectId={projectId}
                projectName={projectName}
              />
            </Suspense>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {context ? (
            <button
              type="button"
              className={cn(
                "inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius)] text-muted transition-colors hover:bg-muted-bg hover:text-foreground lg:hidden",
                focusRing,
              )}
              aria-label={
                contextOpen ? t("shell.closeContext") : t("shell.openContext")
              }
              aria-expanded={contextOpen}
              aria-controls={contextSheetId}
              onClick={() => setContextOpen((v) => !v)}
              title={t("shell.contextPanel")}
            >
              <PanelRight size={20} strokeWidth={2} aria-hidden />
            </button>
          ) : null}
          <Suspense fallback={null}>
            <ShellNav projectId={projectId} />
          </Suspense>
        </div>
      </div>

      <div
        className={cn(
          "grid min-h-0 min-w-0 flex-1 grid-cols-1 transition-[grid-template-columns] duration-200 ease-out",
          collapsed
            ? "lg:grid-cols-[0_minmax(0,1fr)_var(--context-width)]"
            : "lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)_var(--context-width)]",
        )}
        data-sidebar-collapsed={collapsed ? "true" : "false"}
      >
        <aside
          className={cn(
            "scrollbar-thin hidden min-h-0 overflow-y-auto border-r border-border bg-panel lg:block",
            collapsed && "pointer-events-none overflow-hidden border-r-0 opacity-0",
          )}
          aria-hidden={collapsed}
        >
          {sidebar}
        </aside>
        <main
          className={cn(
            "scrollbar-thin min-h-0 min-w-0 bg-background",
            lockMainScroll ? "overflow-hidden" : "overflow-y-auto",
          )}
        >
          {children}
        </main>
        <aside className="scrollbar-thin hidden min-h-0 overflow-y-auto border-l border-border bg-panel-elevated lg:block">
          {context}
        </aside>
      </div>

      {context && contextOpen ? (
        <div
          className="fixed inset-0 z-[55] flex flex-col justify-end lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t("shell.contextPanel")}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label={t("shell.closeContext")}
            onClick={() => setContextOpen(false)}
          />
          <aside
            id={contextSheetId}
            className="safe-pb relative flex max-h-[min(85dvh,40rem)] min-h-[50dvh] w-full flex-col overflow-hidden rounded-t-[calc(var(--radius)*1.5)] border border-border bg-panel-elevated shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <p className="font-display text-sm font-semibold tracking-wide">
                {t("shell.contextPanel")}
              </p>
              <button
                type="button"
                className={cn(
                  "inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius)] text-muted transition-colors hover:bg-muted-bg hover:text-foreground",
                  focusRing,
                )}
                aria-label={t("shell.closeContext")}
                onClick={() => setContextOpen(false)}
              >
                <X size={20} aria-hidden />
              </button>
            </div>
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
              {context}
            </div>
          </aside>
        </div>
      ) : null}

      {!chat.open ? (
        <button
          type="button"
          onClick={() => chat.setOpen(true)}
          className={cn(
            "fab-safe fixed z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-nav/40 bg-nav text-background shadow-md transition hover:bg-nav-hover hover:shadow-lg sm:h-auto sm:w-auto sm:gap-2 sm:px-3.5 sm:py-2.5 sm:shadow-lg lg:bottom-8 lg:right-8 lg:gap-2.5 lg:px-4 lg:py-3",
            focusRing,
            "focus-visible:ring-offset-background",
          )}
          aria-label={t("shell.openChat")}
          title={t("shell.projectChat")}
        >
          <MessageSquare size={18} strokeWidth={2.25} aria-hidden className="sm:size-5" />
          <span className="hidden text-sm font-semibold sm:inline">
            {t("nav.chat")}
          </span>
        </button>
      ) : null}

      <ChatDrawer projectId={projectId} />
    </div>
  );
}

export function WorkspaceShell({
  projectName,
  projectId,
  sidebar,
  context,
  children,
}: {
  projectName: string;
  projectId: string;
  sidebar: React.ReactNode;
  context?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <ChatPanelProvider>
      <WorkspaceShellInner
        projectName={projectName}
        projectId={projectId}
        sidebar={sidebar}
        context={context}
      >
        {children}
      </WorkspaceShellInner>
    </ChatPanelProvider>
  );
}
