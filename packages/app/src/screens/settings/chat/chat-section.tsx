import { useCallback, useMemo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  SettingsCard,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@/components/settings";
import { isNative } from "@/constants/platform";
import { useAppSettings, type AppSettings } from "@/hooks/use-settings";

const TOOL_CALL_DETAIL_LEVELS: readonly AppSettings["toolCallDetailLevel"][] = [
  "detailed",
  "overview",
];
const MARKDOWN_OUTLINE_DEPTHS = ["1", "2", "3", "4", "5", "6"] as const;

export function ChatSection() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();

  const toolCallDetailOptions = useMemo(
    () =>
      TOOL_CALL_DETAIL_LEVELS.map((value) => ({
        value,
        label: t(`settings.general.toolCallDetail.options.${value}`),
      })),
    [t],
  );

  const changeToolCallDetailLevel = useCallback(
    (toolCallDetailLevel: AppSettings["toolCallDetailLevel"]) =>
      void updateSettings({ toolCallDetailLevel }),
    [updateSettings],
  );
  const changeAutoExpandReasoning = useCallback(
    (autoExpandReasoning: boolean) => void updateSettings({ autoExpandReasoning }),
    [updateSettings],
  );
  const changeChatOutline = useCallback(
    (chatOutlineEnabled: boolean) => void updateSettings({ chatOutlineEnabled }),
    [updateSettings],
  );
  const markdownOutlinePositionOptions = useMemo(
    () =>
      (["left", "right"] as const).map((value) => ({
        value,
        label: t(`settings.appearance.markdownOutline.position.options.${value}`),
      })),
    [t],
  );
  const markdownOutlineDepthOptions = useMemo(
    () =>
      MARKDOWN_OUTLINE_DEPTHS.map((value) => ({
        value,
        label: `H${value}`,
      })),
    [],
  );
  const changeMarkdownOutline = useCallback(
    (markdownOutlineEnabled: boolean) => void updateSettings({ markdownOutlineEnabled }),
    [updateSettings],
  );
  const changeMarkdownOutlinePosition = useCallback(
    (markdownOutlinePosition: AppSettings["markdownOutlinePosition"]) =>
      void updateSettings({ markdownOutlinePosition }),
    [updateSettings],
  );
  const changeMarkdownOutlineDepth = useCallback(
    (value: string) => void updateSettings({ markdownOutlineDepth: Number(value) }),
    [updateSettings],
  );

  return (
    <View>
      <SettingsSection title={t("settings.appearance.detailLevel.title")}>
        <SettingsCard>
          <SettingsSwitch
            label={t("settings.general.autoExpandReasoning.label")}
            hint={t("settings.general.autoExpandReasoning.description")}
            value={settings.autoExpandReasoning}
            onValueChange={changeAutoExpandReasoning}
          />
          <SettingsSelect
            label={t("settings.general.toolCallDetail.label")}
            hint={t("settings.general.toolCallDetail.description")}
            value={settings.toolCallDetailLevel}
            options={toolCallDetailOptions}
            onValueChange={changeToolCallDetailLevel}
          />
          {isNative ? null : (
            <SettingsSwitch
              label={t("settings.appearance.chatOutline.title")}
              hint={t("settings.appearance.chatOutline.description")}
              value={settings.chatOutlineEnabled}
              onValueChange={changeChatOutline}
            />
          )}
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t("settings.appearance.markdownOutline.title")}>
        <SettingsCard>
          <SettingsSwitch
            label={t("settings.appearance.markdownOutline.enabled")}
            hint={t("settings.appearance.markdownOutline.enabledDescription")}
            value={settings.markdownOutlineEnabled}
            onValueChange={changeMarkdownOutline}
          />
          <SettingsSelect
            label={t("settings.appearance.markdownOutline.position.label")}
            hint={t("settings.appearance.markdownOutline.position.description")}
            value={settings.markdownOutlinePosition}
            options={markdownOutlinePositionOptions}
            onValueChange={changeMarkdownOutlinePosition}
            disabled={!settings.markdownOutlineEnabled}
          />
          <SettingsSelect
            label={t("settings.appearance.markdownOutline.depth.label")}
            hint={t("settings.appearance.markdownOutline.depth.description")}
            value={String(settings.markdownOutlineDepth)}
            options={markdownOutlineDepthOptions}
            onValueChange={changeMarkdownOutlineDepth}
            disabled={!settings.markdownOutlineEnabled}
          />
        </SettingsCard>
      </SettingsSection>
    </View>
  );
}
