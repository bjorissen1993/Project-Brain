"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Menu, X } from "lucide-react";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_LOCAL_DISPLAY_NAME,
  initialsFromDisplayName,
  readLocalDisplayName,
  subscribeLocalDisplayName,
} from "@/features/auth";
import { structureEntryHref } from "@/features/focus-space/structure-href";
import { guidanceHref } from "@/features/guidance/guidance-href";
import { useT } from "@/features/i18n";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  active: boolean;
};

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-nav/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel";

function SettingsAvatar({
  projectId,
  onSettings,
  displayName,
  initials,
  className,
}: {
  projectId: string;
  onSettings: boolean;
  displayName: string;
  initials: string;
  className?: string;
}) {
  const t = useT();
  return (
    <Link
      href={`/projects/${projectId}/settings`}
      title={t("nav.settingsTitle", { name: displayName })}
      aria-label={t("nav.userSettings")}
      aria-current={onSettings ? "page" : undefined}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tracking-wide transition",
        focusRing,
        onSettings
          ? "bg-nav text-background ring-2 ring-nav/40"
          : "bg-nav-muted text-nav hover:ring-2 hover:ring-nav/35",
        className,
      )}
    >
      {initials}
    </Link>
  );
}

export function ShellNav({ projectId }: { projectId: string }) {
  const t = useT();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const onFocus = /\/projects\/[^/]+\/focus(\/|$)/.test(pathname);
  const onNodes = /\/nodes\b/.test(pathname);
  const onGuidance =
    pathname === `/projects/${projectId}` ||
    pathname === `/projects/${projectId}/`;
  const onSettings = /\/settings(\/|$)/.test(pathname);

  const focusMatch = pathname.match(/\/projects\/[^/]+\/focus\/([^/]+)/);
  const focusNodeId =
    focusMatch?.[1] ??
    (onGuidance ? searchParams.get("nodeId") : null);

  // SSR-safe default; restore last Structure view (+ node) after mount / nav.
  const [structureHref, setStructureHref] = useState(
    `/projects/${projectId}/focus`,
  );
  const search = searchParams.toString();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStructureHref(structureEntryHref(projectId));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [projectId, pathname, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => setMenuOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const { data: session } = useSession();
  const localName = useSyncExternalStore(
    subscribeLocalDisplayName,
    readLocalDisplayName,
    () => DEFAULT_LOCAL_DISPLAY_NAME,
  );
  const displayName =
    session?.user?.name?.trim() ||
    session?.user?.email?.trim() ||
    localName;
  const initials = initialsFromDisplayName(displayName);

  const items: NavItem[] = [
    {
      href: structureHref,
      label: t("nav.structure"),
      active: onFocus || onNodes,
    },
    {
      href: guidanceHref(projectId, focusNodeId),
      label: t("nav.guidance"),
      active: onGuidance,
    },
    {
      href: `/projects/${projectId}/design-focus`,
      label: t("nav.designFocus"),
      active: /\/projects\/[^/]+\/design-focus(\/|$)/.test(pathname),
    },
    {
      href: `/projects/${projectId}/graph`,
      label: t("nav.graph"),
      active: /\/graph\b/.test(pathname),
    },
    {
      href: `/projects/${projectId}/timeline`,
      label: t("nav.timeline"),
      active: /\/timeline\b/.test(pathname),
    },
    {
      href: `/projects/${projectId}/board`,
      label: t("nav.board"),
      active: /\/board\b/.test(pathname),
    },
    {
      href: `/projects/${projectId}/balance`,
      label: t("nav.balance"),
      active: /\/(balance|intelligence)\b/.test(pathname),
    },
    {
      href: `/projects/${projectId}/profile`,
      label: t("nav.profile"),
      active: /\/(profile|intent)\b/.test(pathname),
    },
  ];

  const settingsHref = `/projects/${projectId}/settings`;

  return (
    <>
      {/* Desktop: wrap-friendly inline tabs */}
      <nav
        className="hidden max-w-[min(100%,56rem)] flex-wrap items-center justify-end gap-0.5 lg:flex"
        aria-label={t("nav.project")}
      >
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-[var(--radius)] px-2.5 py-1.5 text-xs font-medium tracking-wide transition",
              focusRing,
              item.active
                ? "bg-nav-muted text-nav"
                : "text-muted hover:bg-muted-bg hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
        <SettingsAvatar
          projectId={projectId}
          onSettings={onSettings}
          displayName={displayName}
          initials={initials}
          className="ml-1"
        />
      </nav>

      {/* Phone / tablet: menu only — profile lives inside the sheet */}
      <div className="flex items-center lg:hidden">
        <button
          type="button"
          className={cn(
            "inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius)] text-muted transition-colors hover:bg-muted-bg hover:text-foreground",
            focusRing,
          )}
          aria-label={menuOpen ? t("shell.closeMenu") : t("shell.openMenu")}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? (
            <X size={22} strokeWidth={2} aria-hidden />
          ) : (
            <Menu size={22} strokeWidth={2} aria-hidden />
          )}
        </button>
      </div>

      {menuOpen ? (
        <div
          className="fixed inset-0 z-[60] flex justify-end lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t("shell.menu")}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label={t("shell.closeMenu")}
            onClick={() => setMenuOpen(false)}
          />
          <nav
            id={menuId}
            className="safe-pb relative flex h-full w-[min(100%,20rem)] flex-col border-l border-border bg-panel shadow-2xl"
            aria-label={t("nav.project")}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5">
              <p className="font-display text-sm font-semibold tracking-wide text-foreground">
                {t("shell.menu")}
              </p>
              <button
                type="button"
                className={cn(
                  "inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius)] text-muted transition-colors hover:bg-muted-bg hover:text-foreground",
                  focusRing,
                )}
                aria-label={t("shell.closeMenu")}
                onClick={() => setMenuOpen(false)}
              >
                <X size={20} aria-hidden />
              </button>
            </div>
            <ul className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={item.active ? "page" : undefined}
                    className={cn(
                      "flex min-h-12 items-center rounded-[var(--radius)] px-3.5 py-3 text-[15px] font-medium transition",
                      focusRing,
                      item.active
                        ? "bg-nav-muted text-nav"
                        : "text-foreground hover:bg-muted-bg",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="border-t border-border px-2.5 py-3">
              <Link
                href={settingsHref}
                onClick={() => setMenuOpen(false)}
                title={t("nav.settingsTitle", { name: displayName })}
                aria-label={t("nav.userSettings")}
                aria-current={onSettings ? "page" : undefined}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-[var(--radius)] px-3.5 py-3 transition",
                  focusRing,
                  onSettings
                    ? "bg-nav-muted text-nav"
                    : "text-foreground hover:bg-muted-bg",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold tracking-wide",
                    onSettings
                      ? "bg-nav text-background"
                      : "bg-nav-muted text-nav",
                  )}
                  aria-hidden
                >
                  {initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">
                    {t("nav.settings")}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {displayName}
                  </span>
                </span>
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
    </>
  );
}
