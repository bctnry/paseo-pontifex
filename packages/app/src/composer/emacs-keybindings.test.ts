import { describe, expect, it } from "vitest";
import {
  applyEmacsComposerKey,
  isEmacsComposerKey,
  type EmacsKeyEvent,
  type EmacsKeyState,
} from "./emacs-keybindings";

function state(
  value: string,
  selectionStart = value.length,
  selectionEnd = selectionStart,
  killRing = "",
): EmacsKeyState {
  return { value, selectionStart, selectionEnd, killRing };
}

function key(keyValue: string, event: Omit<EmacsKeyEvent, "key"> = {}): EmacsKeyEvent {
  return { key: keyValue, ...event };
}

describe("composer Emacs keybindings", () => {
  it("moves to the beginning and end of the current line", () => {
    const lineStart = applyEmacsComposerKey(state("one\ntwo", 6), key("a", { ctrlKey: true }));
    expect(lineStart.selectionStart).toBe(4);
    expect(lineStart.selectionEnd).toBe(4);

    const lineEnd = applyEmacsComposerKey(state("one\ntwo", 5), key("e", { ctrlKey: true }));
    expect(lineEnd.selectionStart).toBe(7);
    expect(lineEnd.selectionEnd).toBe(7);
  });

  it("moves by word with Alt+B and Alt+F", () => {
    const backward = applyEmacsComposerKey(state("hello world", 11), key("b", { altKey: true }));
    expect(backward.selectionStart).toBe(6);

    const forward = applyEmacsComposerKey(state("hello world", 0), key("f", { altKey: true }));
    expect(forward.selectionStart).toBe(5);
  });

  it("kills to the end of the line and yanks the same text", () => {
    const killed = applyEmacsComposerKey(
      state("hello world", 5, 5, "previous"),
      key("k", { ctrlKey: true }),
    );
    expect(killed.value).toBe("hello");
    expect(killed.killRing).toBe(" world");
    expect(killed.selectionStart).toBe(5);

    const yanked = applyEmacsComposerKey(killed, key("y", { ctrlKey: true }));
    expect(yanked.value).toBe("hello world");
    expect(yanked.selectionStart).toBe(11);
  });

  it("kills the previous word with Ctrl+W", () => {
    const result = applyEmacsComposerKey(
      state("hello world", 11, 11, ""),
      key("w", { ctrlKey: true }),
    );
    expect(result.value).toBe("hello ");
    expect(result.killRing).toBe("world");
    expect(result.selectionStart).toBe(6);
  });

  it("deletes at point with Ctrl+D and backward with Ctrl+H", () => {
    const forward = applyEmacsComposerKey(state("abc", 1), key("d", { ctrlKey: true }));
    expect(forward.value).toBe("ac");
    expect(forward.selectionStart).toBe(1);

    const backward = applyEmacsComposerKey(state("abc", 2), key("h", { ctrlKey: true }));
    expect(backward.value).toBe("ac");
    expect(backward.selectionStart).toBe(1);
  });

  it("uses a selection as the kill region", () => {
    const result = applyEmacsComposerKey(
      state("hello world", 0, 5, ""),
      key("w", { ctrlKey: true }),
    );
    expect(result.value).toBe(" world");
    expect(result.killRing).toBe("hello");
    expect(result.selectionStart).toBe(0);
  });

  it("transposes characters around point", () => {
    const result = applyEmacsComposerKey(state("ab", 1), key("t", { ctrlKey: true }));
    expect(result.value).toBe("ba");
    expect(result.selectionStart).toBe(2);
  });

  it("leaves shifted and app shortcuts alone", () => {
    expect(isEmacsComposerKey(key("a", { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isEmacsComposerKey(key("k", { metaKey: true }))).toBe(false);
    expect(isEmacsComposerKey(key("Enter"))).toBe(false);
  });

  it("maps Option-modified letters by physical key on macOS", () => {
    expect(isEmacsComposerKey(key("∫", { code: "KeyB", altKey: true }))).toBe(true);
  });
});
