// Budget accounting measures serialized payloads, so the result must match the
// bytes the store actually holds. TextEncoder is native and much faster than a
// per-code-unit loop; React Native runtimes without it fall back to the loop.
const textEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

export function utf8ByteLength(text: string): number {
  if (textEncoder) {
    return textEncoder.encode(text).byteLength;
  }

  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}
