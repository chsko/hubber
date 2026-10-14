import type { api } from "@hubbr/backend/api";
import type { FunctionReturnType } from "convex/server";

export type Message = FunctionReturnType<typeof api.messages.list>["page"][number];

/** Quick reactions offered on long-press. Any single emoji is accepted by the server. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🎉"] as const;

/** Matches the server's EDIT_WINDOW_MS. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;
