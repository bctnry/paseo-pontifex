import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";

/**
 * Agent reasoning reaches the timeline as a `ToolCall` named "thinking" whose
 * detail is `{ type: "unknown", input: <reasoning text>, output: null }`; see
 * the `ThoughtSlot` in `@/agent-stream/view`. The text is Markdown, so the
 * details surface renders it through the shared Markdown renderer instead of
 * the generic plain-text fallback.
 */
export function thinkingTextFromToolCall(
  toolName: string | undefined,
  detail: ToolCallDetail | undefined,
): string | null {
  if (toolName === undefined || toolName.trim().toLowerCase() !== "thinking") {
    return null;
  }
  if (detail?.type !== "unknown" || typeof detail.input !== "string") {
    return null;
  }
  return detail.input;
}
