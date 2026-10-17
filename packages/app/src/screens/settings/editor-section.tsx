import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard, SettingsSection, SettingsSelect } from "@/components/settings";
import { useAppSettings, type EditorKeybindings } from "@/hooks/use-settings";

const EDITOR_KEYBINDINGS: readonly EditorKeybindings[] = ["default", "vim", "emacs"];

export function EditorSection() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const options = useMemo(
    () =>
      EDITOR_KEYBINDINGS.map((value) => ({
        value,
        label: t(`settings.editor.keybindings.options.${value}`),
      })),
    [t],
  );
  const change = useCallback(
    (editorKeybindings: EditorKeybindings) => void updateSettings({ editorKeybindings }),
    [updateSettings],
  );
  return (
    <SettingsSection title={t("settings.editor.title")}>
      <SettingsCard>
        <SettingsSelect
          label={t("settings.editor.keybindings.label")}
          hint={t("settings.editor.keybindings.hint")}
          value={settings.editorKeybindings}
          options={options}
          onValueChange={change}
          testID="editor-keybindings-select"
        />
      </SettingsCard>
    </SettingsSection>
  );
}
