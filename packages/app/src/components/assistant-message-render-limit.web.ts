import type { CappedAssistantMessage } from "./assistant-message-render-limit.shared";
export {
  getUtf8ByteLength,
  type CappedAssistantMessage,
} from "./assistant-message-render-limit.shared";

const graphemeSegmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

export const ASSISTANT_MESSAGE_RENDER_CHARACTER_LIMIT = 32_000;

let cachedCapped: { text: string; capped: true } | null = null;

export function capAssistantMessageForRender(message: string): CappedAssistantMessage {
  if (message.length <= ASSISTANT_MESSAGE_RENDER_CHARACTER_LIMIT) {
    return { text: message, capped: false };
  }
  // Streaming appends never move a cap that was already found at the limit.
  if (cachedCapped && message.startsWith(cachedCapped.text)) {
    return cachedCapped;
  }

  let end = ASSISTANT_MESSAGE_RENDER_CHARACTER_LIMIT;
  if (graphemeSegmenter) {
    end = graphemeSegmenter.segment(message).containing(end)!.index;
  } else {
    const finalCodeUnit = message.charCodeAt(end - 1);
    if (finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff) {
      end -= 1;
    }
  }

  cachedCapped = { text: message.slice(0, end), capped: true as const };
  return cachedCapped;
}
