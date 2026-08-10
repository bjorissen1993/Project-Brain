"use client";

import { Suspense, useEffect, useState } from "react";
import { MessageSquare, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { ShellNav } from "@/components/layout/shell-nav";
import { StructureShellBreadcrumbs } from "@/components/layout/structure-shell-breadcrumbs";
import { ChatDrawer, ChatPanelProvider, useChatPanel } from "@/features/chat";
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
  // Constant for SSR + first client paint; restore localStorage after mount.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setCollapsed(readSidebarCollapsed());
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

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

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-panel px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted transition-colors hover:bg-muted-bg hover:text-foreground lg:inline-flex"
            aria-label={collapsed ? "Expand projects sidebar" : "Collapse projects sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand projects" : "Collapse projects"}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} strokeWidth={2} aria-hidden />
            ) : (
              <PanelLeftClose size={18} strokeWidth={2} aria-hidden />
            )}
          </button>
          <BrandMark variant="lockup" className="min-w-0 shrink-0" />
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
        <Suspense fallback={null}>
          <ShellNav projectId={projectId} />
        </Suspense>
      </div>

      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-1 transition-[grid-template-columns] duration-200 ease-out",
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
        <main className="scrollbar-thin min-h-0 overflow-y-auto bg-background">
          {children}
        </main>
        <aside className="scrollbar-thin hidden min-h-0 overflow-y-auto border-l border-border bg-panel-elevated lg:block">
          {context}
        </aside>
      </div>

      {!chat.open ? (
        <button
          type="button"
          onClick={() => chat.setOpen(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-panel-elevated text-nav shadow-lg transition hover:border-nav hover:bg-nav-muted lg:bottom-6 lg:right-6"
          aria-label="Open project chat"
          title="Project chat"
        >
          <MessageSquare size={20} strokeWidth={2} aria-hidden />
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
