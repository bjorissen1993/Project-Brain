"use client";

import {
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import type { NormPos } from "./focus-blob-layout";
import {
  relationVisuals,
  type ScoredRelation,
} from "./relation-strength";

type Pt = { x: number; y: number };

const PARTICLE_CAP = 36;

type PathParticle = {
  id: number;
  key: string;
  t: number;
  speed: number;
  size: number;
  opacity: number;
  life: number;
  maxLife: number;
  directed: boolean;
};

type CurveCache = {
  p0: Pt;
  p1: Pt;
  p2: Pt;
  p3: Pt;
  strength: number;
  explicit: boolean;
  directed: boolean;
  sourceId: string;
  targetId: string;
};

function cubicPoint(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

/** Organic cubic Bézier between blob centers with a stable perpendicular bow. */
export function relationCurve(
  from: Pt,
  to: Pt,
  seed: string,
): { d: string; p0: Pt; p1: Pt; p2: Pt; p3: Pt } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const side = hash % 2 === 0 ? 1 : -1;
  const bow = Math.min(48, dist * 0.22) * side;
  const p0 = from;
  const p3 = to;
  const p1 = {
    x: from.x + dx * 0.28 + nx * bow,
    y: from.y + dy * 0.28 + ny * bow,
  };
  const p2 = {
    x: from.x + dx * 0.72 + nx * bow * 0.85,
    y: from.y + dy * 0.72 + ny * bow * 0.85,
  };
  const d = `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;
  return { d, p0, p1, p2, p3 };
}

function centerPx(
  pos: NormPos | undefined,
  size: { w: number; h: number },
): Pt {
  return {
    x: (pos?.nx ?? 0.5) * size.w,
    y: (pos?.ny ?? 0.5) * size.h,
  };
}

/**
 * Relation curves + path particles under blobs.
 * Scores stay memoized upstream; path `d` updates from positionsRef while dragging.
 */
export function FocusRelationLayer({
  relations,
  positions,
  positionsRef,
  size,
  dragging,
  emphasizedId,
  colorFor,
}: {
  relations: ScoredRelation[];
  positions: Record<string, NormPos>;
  positionsRef: RefObject<Record<string, NormPos>>;
  size: { w: number; h: number };
  dragging: boolean;
  emphasizedId: string | null;
  colorFor: (id: string) => string;
}) {
  const pathRefs = useRef<Map<string, SVGPathElement>>(new Map());
  const particleLayerRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<PathParticle[]>([]);
  const particleId = useRef(0);
  const reducedMotionRef = useRef(false);
  const lastSpawnRef = useRef<Map<string, number>>(new Map());
  const relationsRef = useRef(relations);
  const sizeRef = useRef(size);
  const emphasizedRef = useRef(emphasizedId);
  const draggingRef = useRef(dragging);

  const relationKey = useMemo(
    () => relations.map((r) => `${r.key}:${r.strength}:${r.explicit ? 1 : 0}`).join("|"),
    [relations],
  );

  useEffect(() => {
    relationsRef.current = relations;
  }, [relations]);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);
  useEffect(() => {
    emphasizedRef.current = emphasizedId;
  }, [emphasizedId]);
  useEffect(() => {
    draggingRef.current = dragging;
  }, [dragging]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      reducedMotionRef.current = mq.matches;
      if (mq.matches) {
        particlesRef.current = [];
        lastSpawnRef.current.clear();
        particleLayerRef.current?.replaceChildren();
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Continuous rAF: morph paths from live positions + drive capped particles.
  useEffect(() => {
    let raf = 0;
    let active = true;

    const tick = (now: number) => {
      if (!active) return;
      const rels = relationsRef.current;
      const sz = sizeRef.current;
      const live = positionsRef.current;
      const focus = emphasizedRef.current;
      const nextCurves = new Map<string, CurveCache>();

      for (const rel of rels) {
        const from = centerPx(live[rel.sourceId], sz);
        const to = centerPx(live[rel.targetId], sz);
        const curve = relationCurve(from, to, rel.key);
        pathRefs.current.get(rel.key)?.setAttribute("d", curve.d);
        nextCurves.set(rel.key, {
          p0: curve.p0,
          p1: curve.p1,
          p2: curve.p2,
          p3: curve.p3,
          strength: rel.strength,
          explicit: rel.explicit,
          directed: rel.directed,
          sourceId: rel.sourceId,
          targetId: rel.targetId,
        });
      }

      if (!reducedMotionRef.current && rels.length > 0) {
        for (const rel of rels) {
          if (particlesRef.current.length >= PARTICLE_CAP) break;
          const vis = relationVisuals(rel.strength, rel.explicit);
          const emphasize =
            focus != null &&
            (rel.sourceId === focus || rel.targetId === focus);
          // Higher particleCount → shorter spawn interval (still 1 particle/tick).
          const interval =
            (emphasize ? vis.particleFrequency * 0.65 : vis.particleFrequency) /
            Math.max(1, vis.particleCount * 0.65);
          const last = lastSpawnRef.current.get(rel.key) ?? 0;
          if (now - last < interval) continue;
          lastSpawnRef.current.set(rel.key, now);

          particlesRef.current.push({
            id: ++particleId.current,
            key: rel.key,
            t: rel.directed ? Math.random() * 0.08 : 0.35 + Math.random() * 0.3,
            speed:
              (vis.particleSpeed * (emphasize ? 1.2 : 1) * (0.85 + Math.random() * 0.3)) /
              70,
            size: 2 + (rel.strength / 100) * 2.6,
            opacity: 0.22 + (rel.strength / 100) * 0.42,
            life: 0,
            maxLife: 70 + Math.round((rel.strength / 100) * 55),
            directed: rel.directed,
          });
        }

        const keep: PathParticle[] = [];
        for (const p of particlesRef.current) {
          const curve = nextCurves.get(p.key);
          if (!curve) continue;
          p.life += 1;
          if (p.directed) {
            p.t += p.speed;
            if (p.t > 1 || p.life > p.maxLife) continue;
          } else {
            p.t += (Math.random() > 0.5 ? 1 : -1) * p.speed * 0.45;
            p.t = Math.min(0.9, Math.max(0.1, p.t));
            if (p.life > p.maxLife) continue;
          }
          keep.push(p);
        }
        particlesRef.current = keep.slice(0, PARTICLE_CAP);

        const layer = particleLayerRef.current;
        if (layer) {
          const frag = document.createDocumentFragment();
          for (const p of particlesRef.current) {
            const curve = nextCurves.get(p.key);
            if (!curve) continue;
            const pt = cubicPoint(
              curve.p0,
              curve.p1,
              curve.p2,
              curve.p3,
              p.t,
            );
            const el = document.createElement("span");
            el.className = "focus-rel-particle";
            const fade =
              p.life < 8
                ? p.life / 8
                : p.life > p.maxLife - 14
                  ? Math.max(0, (p.maxLife - p.life) / 14)
                  : 1;
            el.style.left = `${pt.x}px`;
            el.style.top = `${pt.y}px`;
            el.style.width = `${p.size}px`;
            el.style.height = `${p.size}px`;
            el.style.opacity = String(p.opacity * fade);
            frag.appendChild(el);
          }
          layer.replaceChildren(frag);
        }
      }

      raf = window.requestAnimationFrame(tick);
    };

    const spawnMap = lastSpawnRef.current;
    const particleLayer = particleLayerRef.current;
    raf = window.requestAnimationFrame(tick);
    return () => {
      active = false;
      window.cancelAnimationFrame(raf);
      particlesRef.current = [];
      spawnMap.clear();
      particleLayer?.replaceChildren();
    };
  }, [relationKey, positionsRef]);

  if (relations.length === 0 || size.w < 40 || size.h < 40) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${size.w} ${size.h}`}
      >
        <defs>
          {relations.map((rel) => {
            const vis = relationVisuals(rel.strength, rel.explicit);
            const c1 = colorFor(rel.sourceId);
            const c2 = colorFor(rel.targetId);
            return (
              <linearGradient
                key={`g-${rel.key}`}
                id={`focus-rel-grad-${rel.key}`}
                gradientUnits="userSpaceOnUse"
              >
                <stop
                  offset="0%"
                  stopColor={c1}
                  stopOpacity={0.55 * vis.strokeAlpha}
                />
                <stop
                  offset="100%"
                  stopColor={c2}
                  stopOpacity={0.55 * vis.strokeAlpha}
                />
              </linearGradient>
            );
          })}
        </defs>
        {relations.map((rel) => {
          const vis = relationVisuals(rel.strength, rel.explicit);
          const from = centerPx(positions[rel.sourceId], size);
          const to = centerPx(positions[rel.targetId], size);
          const curve = relationCurve(from, to, rel.key);
          const emphasize =
            emphasizedId != null &&
            (rel.sourceId === emphasizedId || rel.targetId === emphasizedId);
          const hasFocusEdges =
            emphasizedId != null &&
            relations.some(
              (r) =>
                r.sourceId === emphasizedId || r.targetId === emphasizedId,
            );
          const dim = hasFocusEdges && !emphasize;
          return (
            <path
              key={rel.key}
              ref={(el) => {
                if (el) pathRefs.current.set(rel.key, el);
                else pathRefs.current.delete(rel.key);
              }}
              d={curve.d}
              fill="none"
              stroke={`url(#focus-rel-grad-${rel.key})`}
              strokeWidth={vis.strokeWidth * (emphasize ? 1.25 : 1)}
              strokeOpacity={
                (emphasize ? Math.min(1, vis.opacity + 0.18) : vis.opacity) *
                (dim ? 0.32 : 1)
              }
              strokeLinecap="round"
              strokeDasharray={vis.dashArray}
              style={{
                filter:
                  vis.glow > 3
                    ? `drop-shadow(0 0 ${vis.glow * (emphasize ? 1.15 : 0.8)}px color-mix(in srgb, ${colorFor(rel.sourceId)} 26%, transparent))`
                    : undefined,
                transition: dragging
                  ? undefined
                  : "stroke-opacity 180ms ease-out, stroke-width 180ms ease-out",
              }}
            />
          );
        })}
      </svg>
      <div
        ref={particleLayerRef}
        className="pointer-events-none absolute inset-0"
      />
    </div>
  );
}
