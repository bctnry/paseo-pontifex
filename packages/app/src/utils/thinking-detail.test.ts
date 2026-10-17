import { describe, expect, it } from "vitest";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { thinkingTextFromToolCall } from "./thinking-detail";

function unknownDetail(input: unknown, output: unknown = null): ToolCallDetail {
  return { type: "unknown", input, output };
}

describe("thinkingTextFromToolCall", () => {
  it("returns the reasoning text for the thinking tool call", () => {
    expect(thinkingTextFromToolCall("thinking", unknownDetail("**bold** reasoning"))).toBe(
      "**bold** reasoning",
    );
  });

  it("matches the tool name case-insensitively and ignores surrounding whitespace", () => {
    expect(thinkingTextFromToolCall("  Thinking ", unknownDetail("reasoning"))).toBe("reasoning");
  });

  it("ignores other tool calls", () => {
    expect(thinkingTextFromToolCall("shell", unknownDetail("ls"))).toBeNull();
    expect(thinkingTextFromToolCall(undefined, unknownDetail("reasoning"))).toBeNull();
  });

  it("ignores details that are not unknown", () => {
    expect(thinkingTextFromToolCall("thinking", { type: "plan", text: "plan" })).toBeNull();
  });

  it("ignores unknown details whose input is not text", () => {
    expect(thinkingTextFromToolCall("thinking", unknownDetail({ command: "ls" }))).toBeNull();
  });
});
