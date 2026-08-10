"use server";

import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/db/client";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function uploadsRoot() {
  return path.join(process.cwd(), "public", "uploads", "nodes");
}

function revalidateImagePaths(projectId: string, nodeId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/nodes/${nodeId}`);
  revalidatePath(`/projects/${projectId}/focus`);
  revalidatePath(`/projects/${projectId}/focus/${nodeId}`);
}

function nodeImageDelegate() {
  return (prisma as { nodeImage?: typeof prisma.nodeImage }).nodeImage;
}

const STALE_CLIENT_MSG =
  "Images unavailable (Prisma client outdated). Run prisma generate and restart the dev server.";

export async function listNodeImagesAction(nodeId: string, projectId: string) {
  const nodeImage = nodeImageDelegate();
  if (!nodeImage) {
    console.error(
      "prisma.nodeImage is undefined — run prisma generate and restart the dev server",
    );
    return [];
  }
  return nodeImage.findMany({
    where: { nodeId, projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function uploadNodeImageAction(formData: FormData): Promise<
  | { ok: true; image: { id: string; url: string; filename: string | null } }
  | { ok: false; error: string }
> {
  const projectId = String(formData.get("projectId") ?? "");
  const nodeId = String(formData.get("nodeId") ?? "");
  const file = formData.get("file");

  if (!projectId || !nodeId) {
    return { ok: false, error: "Missing project or node" };
  }
  if (!(file instanceof File)) {
    return { ok: false, error: "Choose an image file" };
  }
  if (!ALLOWED.has(file.type)) {
    return { ok: false, error: "Use JPEG, PNG, WebP, or GIF" };
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return { ok: false, error: "Image must be under 5 MB" };
  }

  const nodeImage = nodeImageDelegate();
  if (!nodeImage) {
    return { ok: false, error: STALE_CLIENT_MSG };
  }

  const node = await prisma.node.findFirst({
    where: { id: nodeId, projectId },
    select: { id: true },
  });
  if (!node) return { ok: false, error: "Node not found in this project" };

  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : file.type === "image/gif"
          ? "gif"
          : "jpg";
  const safeBase = (file.name || "image")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 80);
  const storedName = `${Date.now()}-${safeBase}.${ext}`.replace(
    /\.(jpg|jpeg|png|webp|gif)\.(jpg|jpeg|png|webp|gif)$/i,
    ".$2",
  );

  const dir = path.join(uploadsRoot(), nodeId);
  await mkdir(dir, { recursive: true });
  const abs = path.join(dir, storedName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(abs, buffer);

  const url = `/uploads/nodes/${nodeId}/${storedName}`;
  const maxSort = await nodeImage.aggregate({
    where: { nodeId },
    _max: { sortOrder: true },
  });

  const image = await nodeImage.create({
    data: {
      projectId,
      nodeId,
      url,
      filename: file.name || storedName,
      mimeType: file.type,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  revalidateImagePaths(projectId, nodeId);
  return {
    ok: true,
    image: { id: image.id, url: image.url, filename: image.filename },
  };
}

export async function removeNodeImageAction(raw: {
  imageId: string;
  projectId: string;
  nodeId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const nodeImage = nodeImageDelegate();
  if (!nodeImage) {
    return { ok: false, error: STALE_CLIENT_MSG };
  }

  const image = await nodeImage.findFirst({
    where: {
      id: raw.imageId,
      projectId: raw.projectId,
      nodeId: raw.nodeId,
    },
  });
  if (!image) return { ok: false, error: "Image not found" };

  await nodeImage.delete({ where: { id: image.id } });

  try {
    const rel = image.url.startsWith("/") ? image.url.slice(1) : image.url;
    const abs = path.join(process.cwd(), "public", rel);
    if (abs.startsWith(path.join(process.cwd(), "public", "uploads"))) {
      await unlink(abs);
    }
  } catch {
    // File may already be gone; DB row is the source of truth for the gallery.
  }

  revalidateImagePaths(raw.projectId, raw.nodeId);
  return { ok: true };
}
