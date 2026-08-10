"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import {
  removeNodeImageAction,
  uploadNodeImageAction,
} from "@/features/nodes/image-actions";

export type NodeImageRow = {
  id: string;
  url: string;
  filename: string | null;
};

export function NodeImageGallery({
  projectId,
  nodeId,
  images,
  compact = false,
}: {
  projectId: string;
  nodeId: string;
  images: NodeImageRow[];
  compact?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<NodeImageRow | null>(null);

  const upload = (file: File) => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("projectId", projectId);
      fd.set("nodeId", nodeId);
      fd.set("file", file);
      const result = await uploadNodeImageAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className={compact ? "space-y-2" : "space-y-3"}>
      {!compact ? (
        <div>
          <h2 className="font-display text-xl">Images</h2>
          <p className="mt-1 text-sm text-muted">
            Reference images for this node. Stored locally for now; easy to
            replace later.
          </p>
        </div>
      ) : null}

      {images.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {images.map((img) => (
            <li
              key={img.id}
              className="group relative h-20 w-20 overflow-hidden rounded-[var(--radius)] border border-border bg-muted-bg"
            >
              <button
                type="button"
                className="absolute inset-0"
                onClick={() => setLightbox(img)}
                aria-label={`View ${img.filename ?? "image"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.filename ?? "Node reference"}
                  className="h-full w-full object-cover"
                />
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await removeNodeImageAction({
                      imageId: img.id,
                      projectId,
                      nodeId,
                    });
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    router.refresh();
                  });
                }}
                className="absolute right-0.5 top-0.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No images yet.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) upload(file);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          {pending ? "Uploading…" : "Add reference image"}
        </Button>
      </div>
      <FieldError>{error}</FieldError>

      {lightbox ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setLightbox(null);
          }}
        >
          <div className="relative max-h-[90dvh] max-w-[min(48rem,100%)] overflow-hidden rounded-[var(--radius)] bg-panel p-2 shadow-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.url}
              alt={lightbox.filename ?? "Full image"}
              className="max-h-[80dvh] w-auto max-w-full object-contain"
            />
            <div className="mt-2 flex justify-end">
              <Button type="button" variant="ghost" onClick={() => setLightbox(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
