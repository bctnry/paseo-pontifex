export interface EmacsKeyEvent {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

export interface EmacsKeyState {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  killRing: string;
}

export interface EmacsKeyResult extends EmacsKeyState {
  /** False means the input should let the browser and the rest of the app handle the key. */
  handled: boolean;
  /** Present only when the text changed. */
  valueChanged: boolean;
}

const CTRL_KEYS = new Set([
  "a",
  "e",
  "b",
  "f",
  "p",
  "n",
  "d",
  "h",
  "k",
  "u",
  "w",
  "y",
  "t",
  "o",
  "g",
]);
const ALT_KEYS = new Set(["b", "f", "d"]);

function keyLetter(event: EmacsKeyEvent): string | null {
  const logical = event.key.length === 1 ? event.key.toLowerCase() : null;
  if (logical && /^[a-z]$/.test(logical)) return logical;
  const physical = event.code?.match(/^Key([A-Z])$/)?.[1]?.toLowerCase();
  return physical ?? logical;
}

/**
 * Whether this key belongs to the composer's Emacs layer. The global shortcut
 * handler uses the same predicate to stay out of the way while the composer is
 * focused.
 */
export function isEmacsComposerKey(event: EmacsKeyEvent): boolean {
  if (event.isComposing || event.keyCode === 229) return false;
  if (event.metaKey || event.shiftKey) return false;
  const letter = keyLetter(event);
  if (letter === null) return false;
  if (event.ctrlKey) return !event.altKey && CTRL_KEYS.has(letter);
  if (event.altKey) return !event.ctrlKey && ALT_KEYS.has(letter);
  return false;
}

function lineStart(value: string, position: number): number {
  return value.lastIndexOf("\n", position - 1) + 1;
}

function lineEnd(value: string, position: number): number {
  const next = value.indexOf("\n", position);
  return next === -1 ? value.length : next;
}

function isWordCharacter(value: string, index: number): boolean {
  if (index < 0 || index >= value.length) return false;
  return /[\p{L}\p{N}_]/u.test(value[index] ?? "");
}

function wordBackward(value: string, position: number): number {
  let index = position;
  while (index > 0 && !isWordCharacter(value, index - 1)) index -= 1;
  while (index > 0 && isWordCharacter(value, index - 1)) index -= 1;
  return index;
}

function wordForward(value: string, position: number): number {
  let index = position;
  while (index < value.length && !isWordCharacter(value, index)) index += 1;
  while (index < value.length && isWordCharacter(value, index)) index += 1;
  return index;
}

function selection(state: EmacsKeyState): { start: number; end: number } {
  return {
    start: Math.min(state.selectionStart, state.selectionEnd),
    end: Math.max(state.selectionStart, state.selectionEnd),
  };
}

function select(state: EmacsKeyState, position: number): EmacsKeyResult {
  const clamped = Math.max(0, Math.min(position, state.value.length));
  return {
    ...state,
    selectionStart: clamped,
    selectionEnd: clamped,
    handled: true,
    valueChanged: false,
  };
}

function replaceRange(
  state: EmacsKeyState,
  start: number,
  end: number,
  text: string,
  point: number,
  killRing = state.killRing,
): EmacsKeyResult {
  const value = state.value.slice(0, start) + text + state.value.slice(end);
  const selectionStart = Math.max(0, Math.min(point, value.length));
  return {
    ...state,
    value,
    selectionStart,
    selectionEnd: selectionStart,
    killRing,
    handled: true,
    valueChanged: value !== state.value,
  };
}

function deleteRange(
  state: EmacsKeyState,
  start: number,
  end: number,
  killRing?: string,
): EmacsKeyResult {
  return replaceRange(state, start, end, "", start, killRing ?? state.killRing);
}

function previousLinePoint(state: EmacsKeyState): number {
  const point = state.selectionStart;
  const start = lineStart(state.value, point);
  if (start === 0) return point;
  const previousStart = lineStart(state.value, start - 1);
  const previousEnd = lineEnd(state.value, previousStart);
  return Math.min(previousStart + (point - start), previousEnd);
}

function nextLinePoint(state: EmacsKeyState): number {
  const point = state.selectionStart;
  const end = lineEnd(state.value, point);
  if (end >= state.value.length) return point;
  const nextStart = end + 1;
  const nextEnd = lineEnd(state.value, nextStart);
  return Math.min(nextStart + (point - lineStart(state.value, point)), nextEnd);
}

function transposeCharacters(state: EmacsKeyState): EmacsKeyResult {
  const point = state.selectionStart;
  if (state.value.length < 2) return { ...state, handled: true, valueChanged: false };
  if (point === 0) return { ...state, handled: true, valueChanged: false };
  if (point >= state.value.length) {
    const value = state.value.slice(0, -2) + state.value.slice(-1) + state.value.slice(-2, -1);
    return {
      ...state,
      value,
      selectionStart: value.length,
      selectionEnd: value.length,
      handled: true,
      valueChanged: true,
    };
  }
  const value =
    state.value.slice(0, point - 1) +
    state.value[point] +
    state.value[point - 1] +
    state.value.slice(point + 1);
  return {
    ...state,
    value,
    selectionStart: point + 1,
    selectionEnd: point + 1,
    handled: true,
    valueChanged: true,
  };
}

/**
 * Resolve one Emacs/readline key against the composer value. The caller applies
 * the returned text and selection. Selection-only commands leave `value`
 * untouched.
 */
function applyCtrlNavigation(state: EmacsKeyState, letter: string): EmacsKeyResult | null {
  switch (letter) {
    case "a":
      return select(state, lineStart(state.value, state.selectionStart));
    case "e":
      return select(state, lineEnd(state.value, state.selectionStart));
    case "b":
      return select(state, state.selectionStart - 1);
    case "f":
      return select(state, state.selectionStart + 1);
    case "p":
      return select(state, previousLinePoint(state));
    case "n":
      return select(state, nextLinePoint(state));
    case "g":
      return select(state, selection(state).start);
    default:
      return null;
  }
}

function applyCtrlEditing(state: EmacsKeyState, letter: string): EmacsKeyResult | null {
  const selected = selection(state);
  const replaceSelection = (text: string): EmacsKeyResult =>
    replaceRange(state, selected.start, selected.end, text, selected.start + text.length);

  switch (letter) {
    case "d": {
      if (selected.start !== selected.end) {
        return deleteRange(state, selected.start, selected.end);
      }
      if (state.selectionStart >= state.value.length) {
        return { ...state, handled: true, valueChanged: false };
      }
      return deleteRange(state, state.selectionStart, state.selectionStart + 1);
    }
    case "h": {
      if (selected.start !== selected.end) {
        return deleteRange(state, selected.start, selected.end);
      }
      if (state.selectionStart === 0) {
        return { ...state, handled: true, valueChanged: false };
      }
      return deleteRange(state, state.selectionStart - 1, state.selectionStart);
    }
    case "k": {
      if (selected.start !== selected.end) {
        const killed = state.value.slice(selected.start, selected.end);
        return deleteRange(state, selected.start, selected.end, killed);
      }
      const start = state.selectionStart;
      let end = lineEnd(state.value, start);
      if (end === start && end < state.value.length) end += 1;
      const killed = state.value.slice(start, end);
      return deleteRange(state, start, end, killed);
    }
    case "u": {
      if (selected.start !== selected.end) {
        const killed = state.value.slice(selected.start, selected.end);
        return deleteRange(state, selected.start, selected.end, killed);
      }
      const start = lineStart(state.value, state.selectionStart);
      const killed = state.value.slice(start, state.selectionStart);
      return deleteRange(state, start, state.selectionStart, killed);
    }
    case "w": {
      if (selected.start !== selected.end) {
        const killed = state.value.slice(selected.start, selected.end);
        return deleteRange(state, selected.start, selected.end, killed);
      }
      const start = wordBackward(state.value, state.selectionStart);
      const killed = state.value.slice(start, state.selectionStart);
      return deleteRange(state, start, state.selectionStart, killed);
    }
    case "y": {
      if (!state.killRing) return { ...state, handled: true, valueChanged: false };
      return replaceSelection(state.killRing);
    }
    case "t":
      return transposeCharacters(state);
    case "o":
      return replaceRange(
        state,
        state.selectionStart,
        state.selectionStart,
        "\n",
        state.selectionStart,
      );
    default:
      return null;
  }
}

function applyAltKey(state: EmacsKeyState, letter: string): EmacsKeyResult | null {
  const selected = selection(state);
  switch (letter) {
    case "b":
      return select(state, wordBackward(state.value, state.selectionStart));
    case "f":
      return select(state, wordForward(state.value, state.selectionStart));
    case "d": {
      if (selected.start !== selected.end) {
        const killed = state.value.slice(selected.start, selected.end);
        return deleteRange(state, selected.start, selected.end, killed);
      }
      const end = wordForward(state.value, state.selectionStart);
      const killed = state.value.slice(state.selectionStart, end);
      return deleteRange(state, state.selectionStart, end, killed);
    }
    default:
      return null;
  }
}

/**
 * Resolve one Emacs/readline key against the composer value. The caller applies
 * the returned text and selection. Selection-only commands leave `value`
 * untouched.
 */
export function applyEmacsComposerKey(state: EmacsKeyState, event: EmacsKeyEvent): EmacsKeyResult {
  if (!isEmacsComposerKey(event)) {
    return { ...state, handled: false, valueChanged: false };
  }

  const letter = keyLetter(event);
  if (letter === null) {
    return { ...state, handled: false, valueChanged: false };
  }
  let result: EmacsKeyResult | null = null;
  if (event.ctrlKey) {
    result = applyCtrlNavigation(state, letter) ?? applyCtrlEditing(state, letter);
  } else if (event.altKey) {
    result = applyAltKey(state, letter);
  }
  return result ?? { ...state, handled: false, valueChanged: false };
}
