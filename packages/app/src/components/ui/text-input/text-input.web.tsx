import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { TextInput } from "react-native";
import { applyEmacsComposerKey } from "@/composer/emacs-keybindings";
import type { EditingTextInputHandle, EditingTextInputProps } from "./types";

interface WebTextInputElement extends TextInput {
  value?: string;
  selectionStart?: number | null;
  selectionEnd?: number | null;
  setSelectionRange?: (start: number, end: number) => void;
  dataset?: DOMStringMap;
  addEventListener(
    type: "compositionstart" | "compositionend" | "keydown",
    listener: EventListener,
  ): void;
  removeEventListener(
    type: "compositionstart" | "compositionend" | "keydown",
    listener: EventListener,
  ): void;
}

function setNativeInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) {
    setter.call(input, value);
  } else {
    input.value = value;
  }
}

export const EditingTextInput = forwardRef<EditingTextInputHandle, EditingTextInputProps>(
  function EditingTextInputWeb(allProps, ref) {
    const {
      initialValue = "",
      onChangeText,
      onPasteImages: _,
      onPasteError: __,
      variant: ___,
      emacsKeybindings = false,
      value: ____,
      defaultValue: _____,
      ...props
    } = allProps as EditingTextInputProps & { value?: unknown; defaultValue?: unknown };
    const inputRef = useRef<TextInput | null>(null);
    const initialTextRef = useRef(initialValue);
    const textRef = useRef(initialTextRef.current);
    const isComposingRef = useRef(false);
    const killRingRef = useRef("");
    const onChangeTextRef = useRef(onChangeText);
    onChangeTextRef.current = onChangeText;

    useEffect(() => {
      const input = inputRef.current as WebTextInputElement | null;
      if (!input) return;

      const startComposition = () => {
        isComposingRef.current = true;
      };
      const endComposition = () => {
        isComposingRef.current = false;
        const nextText = input.value ?? "";
        if (nextText === textRef.current) return;
        textRef.current = nextText;
        onChangeTextRef.current?.(nextText);
      };

      input.addEventListener("compositionstart", startComposition);
      input.addEventListener("compositionend", endComposition);
      return () => {
        input.removeEventListener("compositionstart", startComposition);
        input.removeEventListener("compositionend", endComposition);
      };
    }, []);

    useEffect(() => {
      const input = inputRef.current as WebTextInputElement | null;
      if (!input || !emacsKeybindings) return;
      const element = input as unknown as HTMLTextAreaElement;
      element.dataset.emacsKeybindings = "true";

      const handleKeyDown = (domEvent: KeyboardEvent) => {
        if (domEvent.defaultPrevented || domEvent.isComposing) return;
        const current = inputRef.current as unknown as HTMLTextAreaElement | null;
        if (!current) return;
        const result = applyEmacsComposerKey(
          {
            value: current.value,
            selectionStart: current.selectionStart ?? 0,
            selectionEnd: current.selectionEnd ?? 0,
            killRing: killRingRef.current,
          },
          domEvent,
        );
        if (!result.handled) return;

        domEvent.preventDefault();
        domEvent.stopPropagation();
        killRingRef.current = result.killRing;
        if (result.valueChanged) {
          setNativeInputValue(current, result.value);
          textRef.current = result.value;
          onChangeTextRef.current?.(result.value);
        }
        current.setSelectionRange(result.selectionStart, result.selectionEnd);
      };

      element.addEventListener("keydown", handleKeyDown);
      return () => {
        element.removeEventListener("keydown", handleKeyDown);
        delete element.dataset.emacsKeybindings;
      };
    }, [emacsKeybindings]);

    const handleChangeText = useCallback((nextText: string) => {
      if (isComposingRef.current || nextText === textRef.current) return;
      textRef.current = nextText;
      onChangeTextRef.current?.(nextText);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => inputRef.current?.focus(),
        blur: () => inputRef.current?.blur(),
        isFocused: () => document.activeElement === inputRef.current,
        getText: () => {
          const input = inputRef.current as WebTextInputElement | null;
          const nextText = input?.value ?? textRef.current;
          textRef.current = nextText;
          return nextText;
        },
        replaceText: (nextText, selection) => {
          textRef.current = nextText;
          const input = inputRef.current as WebTextInputElement | null;
          if (input && "value" in input) input.value = nextText;
          if (selection && typeof input?.setSelectionRange === "function") {
            input.setSelectionRange(selection.start, selection.end);
          }
        },
        setSelection: (selection) => {
          const input = inputRef.current as WebTextInputElement | null;
          input?.setSelectionRange?.(selection.start, selection.end);
        },
        reset: () => {
          textRef.current = "";
          const input = inputRef.current as WebTextInputElement | null;
          if (input && "value" in input) input.value = "";
        },
        getNativeRef: () => inputRef.current,
      }),
      [],
    );

    return (
      <TextInput
        {...props}
        ref={inputRef}
        defaultValue={initialTextRef.current}
        onChangeText={handleChangeText}
      />
    );
  },
);
