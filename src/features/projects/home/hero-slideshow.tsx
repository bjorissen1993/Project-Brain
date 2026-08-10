"use client";

import { useEffect, useId, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { cn } from "@/lib/utils";

/** Unique hue per slide — no repeated blues/greens. */
type SlideAccent = "navy" | "teal" | "violet" | "amber" | "rose" | "charcoal";

type Slide = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  accent: SlideAccent;
};

const SLIDES: Slide[] = [
  {
    id: "brand",
    eyebrow: "Project Brain",
    title: "Keep game design intent clear",
    body: "A professional workspace to structure what your game should become — without silent AI rewrites of your data.",
    accent: "navy",
  },
  {
    id: "structure",
    eyebrow: "Structure",
    title: "Organize where ideas live",
    body: "Project Areas become Focus Space folders so systems, story, and content stay navigable as the project grows.",
    accent: "teal",
  },
  {
    id: "focus",
    eyebrow: "Design focus",
    title: "Define what the game emphasizes",
    body: "Design Focuses capture target importance separately from structure — criteria you can inspect, not folders you bury ideas in.",
    accent: "violet",
  },
  {
    id: "intent",
    eyebrow: "Intent",
    title: "Your wording stays the source of truth",
    body: "Capture the experience you want players to feel. Later analysis and suggestions remain advisory until you accept them.",
    accent: "amber",
  },
  {
    id: "relations",
    eyebrow: "Relations",
    title: "See how components connect",
    body: "Link mechanics, characters, quests, and systems so dependencies and design pressure are visible — not buried in notes.",
    accent: "rose",
  },
  {
    id: "ai",
    eyebrow: "AI chat",
    title: "Ask with context, decide yourself",
    body: "Chat against project context for suggestions and checks. Project Brain never silently mutates your structure or intent.",
    accent: "charcoal",
  },
];

const ACCENT_EYEBROW: Record<SlideAccent, string> = {
  navy: "text-[#5eb0ff]",
  teal: "text-[#2ee6c2]",
  violet: "text-purple",
  amber: "text-warning",
  rose: "text-[#ff6b8a]",
  charcoal: "text-[#9aa3c0]",
};

const ACCENT_DOT: Record<SlideAccent, string> = {
  navy: "bg-[#3d8fd9]",
  teal: "bg-[#2ee6c2]",
  violet: "bg-purple",
  amber: "bg-warning",
  rose: "bg-[#ff6b8a]",
  charcoal: "bg-[#8b93a8]",
};

const AUTO_MS = 6500;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return reduced;
}

export function HeroSlideshow({ collapsed = false }: { collapsed?: boolean }) {
  const labelId = useId();
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const slide = SLIDES[index] ?? SLIDES[0]!;
  const autoplay = !reducedMotion && !paused && !collapsed;

  useEffect(() => {
    if (!autoplay) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [autoplay, index]);

  function go(delta: number) {
    setIndex((i) => (i + delta + SLIDES.length) % SLIDES.length);
  }

  return (
    <section
      data-slide={slide.accent}
      aria-hidden={collapsed || undefined}
      className={cn(
        "landing-hero relative w-full overflow-hidden border-b border-border",
        collapsed && "landing-hero-collapsed",
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      <div className="landing-hero-glow pointer-events-none absolute inset-0" aria-hidden />

      <div
        className={cn(
          "landing-hero-slideshow relative mx-auto flex w-full max-w-5xl flex-col items-center px-6 pb-14 pt-6 text-center sm:pb-16 sm:pt-10",
          collapsed && "pointer-events-none",
        )}
      >
        <div
          role="region"
          aria-roledescription="carousel"
          aria-labelledby={labelId}
          className="relative w-full"
        >
          <div className="relative flex flex-col items-center text-center">
            <BrandMark
              variant="full"
              href={null}
              priority
              className="landing-hero-brand mx-auto w-[min(9.5rem,42vw)] drop-shadow-[0_12px_40px_rgba(0,0,0,0.45)] sm:w-[min(11rem,38vw)]"
            />

            <p id={labelId} className="sr-only">
              What Project Brain does
            </p>

            <div
              key={slide.id}
              className={cn(
                "landing-hero-slide mt-5 w-full max-w-xl",
                !reducedMotion && "landing-hero-slide-animate",
              )}
            >
              <p
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-[0.18em]",
                  ACCENT_EYEBROW[slide.accent],
                )}
              >
                {slide.eyebrow}
              </p>
              <h2 className="mt-2 font-display text-2xl leading-tight text-foreground sm:text-[1.75rem]">
                {slide.title}
              </h2>
              <p className="landing-hero-copy mx-auto mt-3 max-w-lg text-sm leading-relaxed text-white/75 sm:text-[15px]">
                {slide.body}
              </p>
            </div>

            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                aria-label="Previous slide"
                tabIndex={collapsed ? -1 : undefined}
                onClick={() => go(-1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-white/15 bg-black/25 text-white/70 transition hover:border-white/30 hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-1.5" role="tablist" aria-label="Slides">
                {SLIDES.map((item, i) => {
                  const active = i === index;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-label={`Slide ${i + 1}: ${item.title}`}
                      tabIndex={collapsed ? -1 : undefined}
                      onClick={() => setIndex(i)}
                      className={cn(
                        "h-2 rounded-full transition-all",
                        active
                          ? cn("w-6", ACCENT_DOT[item.accent])
                          : "w-2 bg-white/25 hover:bg-white/45",
                      )}
                    />
                  );
                })}
              </div>

              <button
                type="button"
                aria-label="Next slide"
                tabIndex={collapsed ? -1 : undefined}
                onClick={() => go(1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-white/15 bg-black/25 text-white/70 transition hover:border-white/30 hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {reducedMotion ? (
              <p className="mt-3 text-[11px] text-white/55">
                Auto-advance paused for reduced motion
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
