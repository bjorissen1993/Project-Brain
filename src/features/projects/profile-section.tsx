"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Collapsible Profile block — keeps major sections scannable. */
export function ProfileSection({
  id,
  title,
  description,
  defaultOpen = false,
  children,
  className,
}: {
  id?: string;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      id={id}
      className={cn("scroll-mt-8 space-y-3", className)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2 text-left"
        aria-expanded={open}
      >
        <span className="mt-1.5 shrink-0 text-muted" aria-hidden>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-display text-xl text-foreground">{title}</span>
          {description ? (
            <span className="mt-1 block text-sm text-muted">{description}</span>
          ) : null}
        </span>
      </button>
      {open ? <div className="space-y-4 pl-6">{children}</div> : null}
    </section>
  );
}
