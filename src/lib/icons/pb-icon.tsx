import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { ICON_COMPONENTS, isIconKey, type IconKey } from "./catalog";

type PbIconProps = {
  icon: IconKey | string | null | undefined;
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Accessible label; omit for decorative icons. */
  label?: string;
};

/** Renders a catalog Lucide icon by stable key. */
export function PbIcon({
  icon,
  size = 16,
  className,
  style,
  label,
}: PbIconProps) {
  if (!icon || !isIconKey(icon)) return null;
  const Comp = ICON_COMPONENTS[icon];
  return (
    <Comp
      size={size}
      className={cn("shrink-0", className)}
      style={style}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}
