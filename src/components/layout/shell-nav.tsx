"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useOptionalChatPanel } from "@/features/chat";
import { guidanceHref } from "@/features/guidance/guidance-href";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  active: boolean;
};

export function ShellNav({ projectId }: { projectId: string }) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const chat = useOptionalChatPanel();
  const onFocus = /\/projects\/[^/]+\/focus(\/|$)/.test(pathname);
  const onNodes = /\/nodes\b/.test(pathname);
  const onGuidance =
    pathname === `/projects/${projectId}` ||
    pathname === `/projects/${projectId}/`;

  const focusMatch = pathname.match(/\/projects\/[^/]+\/focus\/([^/]+)/);
  const focusNodeId =
    focusMatch?.[1] ??
    (onGuidance ? searchParams.get("nodeId") : null);

  const items: NavItem[] = [
    {
      href: `/projects/${projectId}/focus`,
      label: "Structure",
      active: onFocus || onNodes,
    },
    {
      href: guidanceHref(projectId, focusNodeId),
      label: "Guidance",
      active: onGuidance,
    },
    {
      href: `/projects/${projectId}/design-focus`,
      label: "Design Focus",
      active: /\/projects\/[^/]+\/design-focus(\/|$)/.test(pathname),
    },
    {
      href: `/projects/${projectId}/graph`,
      label: "Graph",
      active: /\/graph\b/.test(pathname),
    },
    {
      href: `/projects/${projectId}/timeline`,
      label: "Timeline",
      active: /\/timeline\b/.test(pathname),
    },
    {
      href: `/projects/${projectId}/board`,
      label: "Board",
      active: /\/board\b/.test(pathname),
    },
    {
      href: `/projects/${projectId}/balance`,
      label: "Balance",
      active: /\/(balance|intelligence)\b/.test(pathname),
    },
    {
      href: `/projects/${projectId}/profile`,
      label: "Profile",
      active: /\/(profile|intent)\b/.test(pathname),
    },
  ];

  return (
    <nav
      className="flex max-w-[min(100%,52rem)] flex-wrap items-center justify-end gap-0.5"
      aria-label="Project navigation"
    >
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={cn(
            "rounded-[var(--radius)] px-2 py-1 text-[11px] font-medium tracking-wide transition sm:px-2.5 sm:text-xs",
            item.active
              ? "bg-nav-muted text-nav"
              : "text-muted hover:bg-muted-bg hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
      {chat ? (
        <button
          type="button"
          onClick={() => chat.setOpen(true)}
          className={cn(
            "rounded-[var(--radius)] px-2 py-1 text-[11px] font-medium tracking-wide transition sm:px-2.5 sm:text-xs",
            chat.open
              ? "bg-nav-muted text-nav"
              : "text-muted hover:bg-muted-bg hover:text-foreground",
          )}
        >
          Chat
        </button>
      ) : null}
    </nav>
  );
}
