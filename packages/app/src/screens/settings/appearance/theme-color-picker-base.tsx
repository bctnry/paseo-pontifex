import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, type GestureResponderEvent } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { EditingTextInput, type EditingTextInputHandle } from "@/components/ui/text-input";
import { HEX_COLOR_PATTERN } from "@/styles/plugin-theme";

export interface ThemeColorPickerAnchor {
  x: number;
  y: number;
}

export interface ThemeColorPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Opens a platform color picker anchored near the pressed swatch. */
  onPickColor?: (anchor: ThemeColorPickerAnchor) => void;
}

export function ThemeColorPickerBase({
  label,
  value,
  onChange,
  onPickColor,
}: ThemeColorPickerProps) {
  const { t } = useTranslation();
  const inputRef = useRef<EditingTextInputHandle>(null);
  const textRef = useRef(value);
  const lastEmittedRef = useRef(value);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    textRef.current = value;
    lastEmittedRef.current = value;
    inputRef.current?.replaceText(value);
    setInvalid(false);
  }, [value]);

  const handleChangeText = useCallback(
    (text: string) => {
      textRef.current = text;
      if (HEX_COLOR_PATTERN.test(text)) {
        lastEmittedRef.current = text;
        setInvalid(false);
        onChange(text);
      } else {
        setInvalid(true);
      }
    },
    [onChange],
  );

  const handleBlur = useCallback(() => {
    const trimmed = textRef.current.trim();
    const normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    if (HEX_COLOR_PATTERN.test(normalized)) {
      textRef.current = normalized;
      lastEmittedRef.current = normalized;
      inputRef.current?.replaceText(normalized);
      setInvalid(false);
      onChange(normalized);
      return;
    }
    textRef.current = value;
    lastEmittedRef.current = value;
    inputRef.current?.replaceText(value);
    setInvalid(false);
  }, [onChange, value]);

  const handlePick = useCallback(
    (event: GestureResponderEvent) => {
      const nativeEvent = event.nativeEvent as typeof event.nativeEvent & {
        clientX?: number;
        clientY?: number;
      };
      onPickColor?.({
        x: nativeEvent.clientX ?? nativeEvent.pageX,
        y: nativeEvent.clientY ?? nativeEvent.pageY,
      });
    },
    [onPickColor],
  );

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("settings.appearance.customThemes.pickColor", { label })}
          disabled={!onPickColor}
          onPress={handlePick}
          style={styles.swatchButton}
        >
          <View style={[styles.swatch, { backgroundColor: value }]} />
        </Pressable>
        <EditingTextInput
          ref={inputRef}
          initialValue={value}
          onChangeText={handleChangeText}
          onBlur={handleBlur}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          maxLength={9}
          accessibilityLabel={t("settings.appearance.customThemes.colorValue", { label })}
          style={[styles.input, invalid ? styles.inputInvalid : null]}
        />
      </View>
      {invalid ? (
        <Text style={styles.error}>{t("settings.appearance.customThemes.invalidColor")}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[1],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  label: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  swatchButton: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  swatch: {
    flex: 1,
  },
  input: {
    width: 112,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
  },
  inputInvalid: {
    borderColor: theme.colors.destructive,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
    paddingLeft: theme.spacing[2],
  },
}));
