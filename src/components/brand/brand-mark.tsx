import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Bump when brand assets in /public/brand change. */
export const BRAND_ASSET_VERSION = "3";

const ASSETS = {
  full: {
    src: `/brand/project-brain-full.png?v=${BRAND_ASSET_VERSION}`,
    width: 934,
    height: 1124,
    alt: "Project Brain",
  },
  logo: {
    src: `/brand/project-brain-logo.png?v=${BRAND_ASSET_VERSION}`,
    width: 934,
    height: 683,
    alt: "Project Brain",
  },
  text: {
    src: `/brand/project-brain-text.png?v=${BRAND_ASSET_VERSION}`,
    width: 934,
    height: 467,
    alt: "Project Brain",
  },
} as const;

const BLEND =
  "mix-blend-screen drop-shadow-[0_8px_24px_rgba(0,0,0,0.35)]";

type BrandMarkProps = {
  variant?: "full" | "logo" | "text" | "lockup";
  /** Tailwind size classes for the image(s). */
  className?: string;
  priority?: boolean;
  href?: string | null;
};

export function BrandMark({
  variant = "full",
  className,
  priority = false,
  href = "/",
}: BrandMarkProps) {
  const content =
    variant === "lockup" ? (
      <span className={cn("inline-flex items-center gap-2", className)}>
        <Image
          {...ASSETS.logo}
          alt=""
          priority={priority}
          unoptimized
          className={cn("h-7 w-auto sm:h-8", BLEND)}
        />
        <Image
          {...ASSETS.text}
          alt="Project Brain"
          priority={priority}
          unoptimized
          className={cn("h-7 w-auto sm:h-8", BLEND)}
        />
      </span>
    ) : (
      <Image
        src={ASSETS[variant].src}
        width={ASSETS[variant].width}
        height={ASSETS[variant].height}
        alt={ASSETS[variant].alt}
        priority={priority}
        unoptimized
        className={cn("h-auto w-auto", BLEND, className)}
      />
    );

  if (href === null) {
    return content;
  }

  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center outline-none transition opacity-95 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-nav/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-label="Project Brain home"
    >
      {content}
    </Link>
  );
}
