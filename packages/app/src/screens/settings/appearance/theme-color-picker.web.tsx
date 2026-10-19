import { useCallback } from "react";
import { isWeb } from "@/constants/platform";
import {
  ThemeColorPickerBase,
  type ThemeColorPickerAnchor,
  type ThemeColorPickerProps,
} from "./theme-color-picker-base";

function toColorInputValue(value: string): string {
  const body = value.replace(/^#/, "");
  if (body.length === 3) {
    return `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`;
  }
  if (body.length === 6) return `#${body}`;
  if (body.length === 8) return `#${body.slice(0, 6)}`;
  return "#000000";
}

export function ThemeColorPicker({ label, value, onChange }: ThemeColorPickerProps) {
  const openPicker = useCallback(
    (anchor: ThemeColorPickerAnchor) => {
      if (!isWeb) return;
      const input = document.createElement("input");
      input.type = "color";
      input.value = toColorInputValue(value);
      input.style.position = "fixed";
      input.style.left = `${Math.max(0, anchor.x - window.scrollX + 8)}px`;
      input.style.top = `${Math.max(0, anchor.y - window.scrollY - 16)}px`;
      input.style.width = "1px";
      input.style.height = "1px";
      input.style.padding = "0";
      input.style.margin = "0";
      input.style.border = "0";
      input.style.background = "transparent";
      input.style.opacity = "0";
      document.body.appendChild(input);

      let closed = false;
      const remove = () => {
        if (closed) return;
        closed = true;
        input.remove();
      };
      input.addEventListener("change", () => {
        onChange(input.value);
        remove();
      });
      input.addEventListener("cancel", remove);
      input.click();
    },
    [onChange, value],
  );

  return (
    <ThemeColorPickerBase
      label={label}
      value={value}
      onChange={onChange}
      onPickColor={openPicker}
    />
  );
}
