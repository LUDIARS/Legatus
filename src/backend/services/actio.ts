/**
 * Actio service caller. spec/service-schema.md §3.1.1 準拠.
 */

import { z } from "zod";
import { currentPeerAdapter } from "../peer/peer-adapter.js";
import { LegatusError } from "../../shared/errors.js";

export const TasksCreateInputSchema = z.object({
  userId: z.string().uuid(),
  title: z.string().min(1).max(200),
  body: z.string().max(10_000).optional(),
  deadline: z.string().datetime({ offset: true }).optional(),
  tags: z.array(z.string().regex(/^[a-z0-9_-]{1,32}$/)).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  pluginRef: z
    .object({
      pluginId: z.string().min(1),
      externalId: z.string().min(1),
    })
    .optional(),
  idempotencyKey: z.string().min(1).max(128).optional(),
  source: z
    .object({
      via: z.literal("legatus"),
      tool: z.string().min(1).max(64),
      requestId: z.string().min(1).max(128).optional(),
    })
    .optional(),
});

export type TasksCreateInput = z.infer<typeof TasksCreateInputSchema>;

export interface TasksCreateResponse {
  id: string;
  userId: string;
  title: string;
  deadline: string | null;
  priority: "low" | "normal" | "high";
  createdAt: string;
  url?: string;
}

export async function tasksCreate(input: TasksCreateInput): Promise<TasksCreateResponse> {
  const parsed = TasksCreateInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new LegatusError(
      "bad_request",
      `tasks.create payload invalid: ${parsed.error.message}`,
    );
  }
  const peer = currentPeerAdapter();
  if (!peer) {
    throw new LegatusError("upstream_error", "PeerAdapter unavailable (cernere mode OFF)");
  }

  try {
    return await peer.invoke<TasksCreateResponse>(
      "actio",
      "tasks.create",
      parsed.data,
    );
  } catch (err) {
    throw mapPeerError(err);
  }
}

function mapPeerError(err: unknown): LegatusError {
  const e = err as { code?: string; message?: string };
  if (e?.code) {
    return new LegatusError(
      isKnownErrorCode(e.code) ? e.code : "upstream_error",
      e.message ?? "actio call failed",
      "actio",
    );
  }
  return new LegatusError(
    "upstream_error",
    err instanceof Error ? err.message : String(err),
    "actio",
  );
}

function isKnownErrorCode(
  code: string,
): code is "bad_request" | "forbidden" | "user_not_found" | "quota_exceeded" | "internal_error" {
  return ["bad_request", "forbidden", "user_not_found", "quota_exceeded", "internal_error"].includes(
    code,
  );
}
