"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { BrandMark } from "@/components/brand/brand-mark";
import type { HomeProjectItem } from "@/features/projects/actions";
import { HeroSlideshow } from "./hero-slideshow";
import { MakerProfile } from "./maker-profile";
import { ProjectsBrowser } from "./projects-browser";
import {
  ProjectsToolbar,
  type ProjectListFilter,
} from "./projects-toolbar";
import { ProjectViewMenu } from "./view-menu";
import {
  DEFAULT_PROJECT_VIEW_MODE,
  readProjectViewMode,
  saveProjectViewMode,
  subscribeProjectViewMode,
  type ProjectViewMode,
} from "./view-mode";

/** Scroll past this while the hero is visible → latch closed. */
const HERO_HIDE_SCROLL_Y = 8;
/** Wheel delta that counts as intentional scroll-down / scroll-up. */
const HERO_WHEEL_DELTA = 8;
/** Touch move distance that counts as intentional direction. */
const HERO_TOUCH_DELTA = 12;

export function ProjectsLanding({
  projects,
  dbError,
}: {
  projects: HomeProjectItem[];
  dbError: string | null;
}) {
  const viewMode = useSyncExternalStore(
    subscribeProjectViewMode,
    readProjectViewMode,
    () => DEFAULT_PROJECT_VIEW_MODE,
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProjectListFilter>("all");
  const [favoriteOverrides, setFavoriteOverrides] = useState<
    Record<string, boolean>
  >({});
  // Latch: once hidden, stay hidden until at scrollY≈0 AND user scrolls up.
  const [heroCollapsed, setHeroCollapsed] = useState(false);
  const heroCollapsedRef = useRef(false);
  const touchStartYRef = useRef<number | null>(null);

  useEffect(() => {
    heroCollapsedRef.current = heroCollapsed;
  }, [heroCollapsed]);

  // After hide, pin to top so Projects sits under the sticky bar without bounce.
  useLayoutEffect(() => {
    if (!heroCollapsed) return;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [heroCollapsed]);

  useEffect(() => {
    function hideHero() {
      if (heroCollapsedRef.current) return;
      heroCollapsedRef.current = true;
      setHeroCollapsed(true);
    }

    function showHero() {
      if (!heroCollapsedRef.current) return;
      heroCollapsedRef.current = false;
      setHeroCollapsed(false);
    }

    function atPageTop() {
      return window.scrollY < 1;
    }

    function onWheel(event: WheelEvent) {
      if (event.ctrlKey) return;

      if (!heroCollapsedRef.current) {
        if (event.deltaY > HERO_WHEEL_DELTA) {
          event.preventDefault();
          hideHero();
        }
        return;
      }

      // Hidden: ignore everything except intentional scroll-up at the very top.
      if (atPageTop() && event.deltaY < -HERO_WHEEL_DELTA) {
        event.preventDefault();
        showHero();
      }
    }

    function onScroll() {
      if (heroCollapsedRef.current) return;
      if (window.scrollY > HERO_HIDE_SCROLL_Y) {
        hideHero();
      }
    }

    function onTouchStart(event: TouchEvent) {
      touchStartYRef.current = event.touches[0]?.clientY ?? null;
    }

    function onTouchMove(event: TouchEvent) {
      const startY = touchStartYRef.current;
      const currentY = event.touches[0]?.clientY;
      if (startY == null || currentY == null) return;

      const delta = startY - currentY; // positive = finger up = scroll down

      if (!heroCollapsedRef.current) {
        if (delta > HERO_TOUCH_DELTA) {
          hideHero();
          touchStartYRef.current = currentY;
        }
        return;
      }

      if (atPageTop() && delta < -HERO_TOUCH_DELTA) {
        showHero();
        touchStartYRef.current = currentY;
      }
    }

    function onTouchEnd() {
      touchStartYRef.current = null;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }

      if (!heroCollapsedRef.current) {
        if (
          event.key === "ArrowDown" ||
          event.key === "PageDown" ||
          event.key === " " ||
          event.key === "Spacebar" ||
          event.key === "End"
        ) {
          // Let the browser scroll after hide via the scroll latch path,
          // but if already at top with little room, force the latch closed.
          if (window.scrollY <= HERO_HIDE_SCROLL_Y) {
            event.preventDefault();
            hideHero();
          }
        }
        return;
      }

      if (
        atPageTop() &&
        (event.key === "ArrowUp" || event.key === "PageUp" || event.key === "Home")
      ) {
        event.preventDefault();
        showHero();
      }
    }

    // Non-passive wheel so we can cancel the first scroll that closes the latch.
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function handleViewChange(mode: ProjectViewMode) {
    saveProjectViewMode(mode);
  }

  const projectsWithFavorites = useMemo(
    () =>
      projects.map((project) => ({
        ...project,
        isFavorite: favoriteOverrides[project.id] ?? project.isFavorite,
      })),
    [projects, favoriteOverrides],
  );

  const visibleProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projectsWithFavorites.filter((project) => {
      if (filter === "favorites" && !project.isFavorite) return false;
      if (!q) return true;
      return project.name.toLowerCase().includes(q);
    });
  }, [projectsWithFavorites, query, filter]);

  function setFavoriteOptimistic(projectId: string, next: boolean) {
    setFavoriteOverrides((prev) => ({ ...prev, [projectId]: next }));
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="landing-topbar sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-border bg-background/90 px-6 py-4 backdrop-blur-md">
        <BrandMark variant="lockup" className="min-w-0" priority />
        <MakerProfile />
      </header>

      <HeroSlideshow collapsed={heroCollapsed} />

      <section className="landing-projects mx-auto w-full max-w-[1600px] px-6 py-8 sm:py-10">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="shrink-0">
            <h2 className="font-display text-xl text-foreground">Projects</h2>
            <p className="mt-1 text-sm text-muted">
              {dbError
                ? "Database unavailable"
                : projects.length === 0
                  ? "No projects yet — create your first below"
                  : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
            </p>
          </div>
          {!dbError && projects.length > 0 ? (
            <div className="min-w-0 flex-1">
              <ProjectsToolbar
                query={query}
                onQueryChange={setQuery}
                filter={filter}
                onFilterChange={setFilter}
                resultCount={visibleProjects.length}
                totalCount={projects.length}
              />
            </div>
          ) : null}
          {!dbError ? (
            <div className="ml-auto shrink-0">
              <ProjectViewMenu value={viewMode} onChange={handleViewChange} />
            </div>
          ) : null}
        </div>

        {dbError ? (
          <div className="surface-card p-4 text-sm">
            <p className="font-medium">Database not ready</p>
            <p className="mt-2 text-muted">{dbError}</p>
            <ol className="mt-3 list-inside list-decimal space-y-1 text-muted">
              <li>
                Start Docker Desktop, then run{" "}
                <code className="text-foreground">docker compose up -d</code>
              </li>
              <li>
                Run <code className="text-foreground">npm run db:migrate</code> and{" "}
                <code className="text-foreground">npm run db:seed</code>
              </li>
              <li>
                Restart <code className="text-foreground">npm run dev</code>
              </li>
            </ol>
          </div>
        ) : (
          <ProjectsBrowser
            projects={visibleProjects}
            mode={viewMode}
            onFavoriteChange={setFavoriteOptimistic}
            emptyFilterMessage={
              projects.length > 0 && visibleProjects.length === 0
                ? filter === "favorites"
                  ? "No favorite projects match this view."
                  : "No projects match your search."
                : null
            }
          />
        )}
      </section>
    </div>
  );
}
