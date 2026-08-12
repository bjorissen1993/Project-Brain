"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { useT, type MessageKey } from "@/features/i18n";
import { cn } from "@/lib/utils";

/** Unique hue per slide — no repeated blues/greens. */
type SlideAccent = "navy" | "teal" | "violet" | "amber" | "rose" | "charcoal";

type SlideDef = {
  id: string;
  eyebrow: MessageKey;
  title: MessageKey;
  body: MessageKey;
  accent: SlideAccent;
};

const SLIDE_DEFS: SlideDef[] = [
  {
    id: "brand",
    eyebrow: "hero.slide1Eyebrow",
    title: "hero.slide1Title",
    body: "hero.slide1Body",
    accent: "navy",
  },
  {
    id: "structure",
    eyebrow: "hero.slide2Eyebrow",
    title: "hero.slide2Title",
    body: "hero.slide2Body",
    accent: "teal",
  },
  {
    id: "focus",
    eyebrow: "hero.slide3Eyebrow",
    title: "hero.slide3Title",
    body: "hero.slide3Body",
    accent: "violet",
  },
  {
    id: "intent",
    eyebrow: "hero.slide4Eyebrow",
    title: "hero.slide4Title",
    body: "hero.slide4Body",
    accent: "amber",
  },
  {
    id: "relations",
    eyebrow: "hero.slide5Eyebrow",
    title: "hero.slide5Title",
    body: "hero.slide5Body",
    accent: "rose",
  },
  {
    id: "ai",
    eyebrow: "hero.slide6Eyebrow",
    title: "hero.slide6Title",
    body: "hero.slide6Body",
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
  const t = useT();
  const labelId = useId();
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const slides = useMemo(
    () =>
      SLIDE_DEFS.map((def) => ({
        id: def.id,
        accent: def.accent,
        eyebrow: t(def.eyebrow),
        title: t(def.title),
        body: t(def.body),
      })),
    [t],
  );

  const slide = slides[index] ?? slides[0]!;
  const autoplay = !reducedMotion && !paused && !collapsed;

  useEffect(() => {
    if (!autoplay) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [autoplay, index, slides.length]);

  function go(delta: number) {
    setIndex((i) => (i + delta + slides.length) % slides.length);
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
              {slide.title}
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
                aria-label={t("hero.prev")}
                tabIndex={collapsed ? -1 : undefined}
                onClick={() => go(-1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-white/15 bg-black/25 text-white/70 transition hover:border-white/30 hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div
                className="flex items-center gap-1.5"
                role="tablist"
                aria-label={t("hero.slides")}
              >
                {slides.map((item, i) => {
                  const active = i === index;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-label={`${i + 1}: ${item.title}`}
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
                aria-label={t("hero.next")}
                tabIndex={collapsed ? -1 : undefined}
                onClick={() => go(1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-white/15 bg-black/25 text-white/70 transition hover:border-white/30 hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
