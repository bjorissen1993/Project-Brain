/**
 * Server-only entrypoints.
 * Database access and AI stubs should be imported from feature modules / db —
 * keep secrets and provider clients on the server.
 */
export { prisma } from "@/db/client";
export { getAIService } from "@/features/ai";
