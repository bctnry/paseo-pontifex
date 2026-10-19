import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { SettingsCard, SettingsRow } from "@/components/settings";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { DropdownTrigger } from "@/components/ui/dropdown-trigger";
import { EditingTextInput } from "@/components/ui/text-input";
import { useAppSettings } from "@/hooks/use-settings";
import type { PluginThemeOption } from "@/plugins/themes";
import {
  CUSTOM_THEME_COLOR_KEYS,
  customThemeFileFromPalette,
  customThemeFileName,
  newCustomThemeTemplate,
  paletteFromOption,
  paletteFromTheme,
  parseCustomThemeFile,
  serializeCustomThemeFile,
  type CustomThemeColorKey,
  type CustomThemeOption,
} from "@/styles/custom-theme";
import { settingsStyles } from "@/styles/settings";
import { CUSTOM_THEME_PREFERENCE, THEME_OPTIONS } from "@/styles/theme";
import type { ThemePalette } from "@/styles/theme-palettes";
import { confirmDialog } from "@/utils/confirm-dialog";
import type { CustomThemeCatalog } from "@/appearance/custom-themes";
import { ThemeColorPicker } from "./theme-color-picker";

type EditablePalette = ThemePalette & { accent: string };

interface ThemeBase {
  id: string;
  name: string;
  appearance: "light" | "dark";
  colors: EditablePalette;
  swatch: string;
  source: "builtin" | "plugin" | "custom";
}

interface CustomThemeDraft {
  fileName: string | null;
  name: string;
  appearance: "light" | "dark";
  colors: EditablePalette;
  baseId: string | null;
  revision: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizePalette(colors: ThemePalette): EditablePalette {
  return { ...colors, accent: colors.accent ?? colors.foreground };
}

function ColorSwatch({ color, style }: { color: string; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.swatch, style, { backgroundColor: color }]} />;
}

function CustomThemeRow({
  option,
  selected,
  withBorder,
  onUse,
  onEdit,
  onDelete,
}: {
  option: CustomThemeOption;
  selected: boolean;
  withBorder: boolean;
  onUse(option: CustomThemeOption): void;
  onEdit(option: CustomThemeOption): void;
  onDelete(option: CustomThemeOption): void;
}) {
  const { t } = useTranslation();
  const handleUse = useCallback(() => onUse(option), [onUse, option]);
  const handleEdit = useCallback(() => onEdit(option), [onEdit, option]);
  const handleDelete = useCallback(() => onDelete(option), [onDelete, option]);
  const appearance =
    option.contribution.appearance === "light"
      ? t("settings.appearance.customThemes.light")
      : t("settings.appearance.customThemes.dark");
  return (
    <View style={[styles.themeRow, withBorder ? styles.themeRowBorder : null]}>
      <ColorSwatch color={option.swatch} />
      <View style={styles.themeInfo}>
        <Text style={settingsStyles.rowTitle}>{option.name}</Text>
        <Text style={settingsStyles.rowHint}>
          {option.fileName} · {appearance}
        </Text>
      </View>
      <View style={styles.rowActions}>
        {selected ? (
          <Text style={styles.selectedLabel}>{t("settings.appearance.customThemes.selected")}</Text>
        ) : (
          <Button variant="outline" size="sm" onPress={handleUse}>
            {t("settings.appearance.customThemes.use")}
          </Button>
        )}
        <Button variant="ghost" size="sm" onPress={handleEdit}>
          {t("settings.appearance.customThemes.edit")}
        </Button>
        <Button variant="ghost" size="sm" onPress={handleDelete}>
          {t("settings.appearance.customThemes.delete")}
        </Button>
      </View>
    </View>
  );
}

function ColorSlotRow({
  colorKey,
  value,
  onChange,
}: {
  colorKey: CustomThemeColorKey;
  value: string;
  onChange: (key: CustomThemeColorKey, value: string) => void;
}) {
  const { t } = useTranslation();
  const handleChange = useCallback(
    (next: string) => {
      onChange(colorKey, next);
    },
    [colorKey, onChange],
  );
  return (
    <ThemeColorPicker
      label={t(`settings.appearance.customThemes.colors.${colorKey}`)}
      value={value}
      onChange={handleChange}
    />
  );
}

function AppearanceMenu({
  value,
  onChange,
}: {
  value: "light" | "dark";
  onChange: (value: "light" | "dark") => void;
}) {
  const { t } = useTranslation();
  const selectLight = useCallback(() => onChange("light"), [onChange]);
  const selectDark = useCallback(() => onChange("dark"), [onChange]);
  return (
    <DropdownMenu>
      <DropdownTrigger>
        {value === "light"
          ? t("settings.appearance.customThemes.light")
          : t("settings.appearance.customThemes.dark")}
      </DropdownTrigger>
      <DropdownMenuContent side="bottom" align="end" width={180}>
        <DropdownMenuItem selected={value === "light"} onSelect={selectLight}>
          {t("settings.appearance.customThemes.light")}
        </DropdownMenuItem>
        <DropdownMenuItem selected={value === "dark"} onSelect={selectDark}>
          {t("settings.appearance.customThemes.dark")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BaseThemeMenuItem({
  base,
  selected,
  onSelect,
}: {
  base: ThemeBase;
  selected: boolean;
  onSelect: (base: ThemeBase) => void;
}) {
  const handleSelect = useCallback(() => onSelect(base), [base, onSelect]);
  const leading = useMemo(() => <ColorSwatch color={base.swatch} />, [base.swatch]);
  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect} leading={leading}>
      {base.name}
    </DropdownMenuItem>
  );
}

function BaseThemeGroup({
  label,
  bases,
  selectedId,
  onSelect,
}: {
  label: string;
  bases: ThemeBase[];
  selectedId: string | null;
  onSelect: (base: ThemeBase) => void;
}) {
  if (bases.length === 0) return null;
  return (
    <>
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      {bases.map((base) => (
        <BaseThemeMenuItem
          key={base.id}
          base={base}
          selected={base.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function BaseThemeMenu({
  bases,
  selectedId,
  onSelect,
  placeholder,
}: {
  bases: ThemeBase[];
  selectedId: string | null;
  onSelect: (base: ThemeBase) => void;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const selected = bases.find((base) => base.id === selectedId) ?? null;
  const leading = useMemo(
    () => (selected ? <ColorSwatch color={selected.swatch} /> : undefined),
    [selected],
  );
  const builtIn = bases.filter((base) => base.source === "builtin");
  const plugin = bases.filter((base) => base.source === "plugin");
  const custom = bases.filter((base) => base.source === "custom");
  return (
    <DropdownMenu>
      <DropdownTrigger leading={leading}>
        {selected?.name ?? placeholder ?? t("settings.appearance.customThemes.baseTheme")}
      </DropdownTrigger>
      <DropdownMenuContent side="bottom" align="end" width={260} scrollable>
        <BaseThemeGroup
          label={t("settings.appearance.customThemes.baseBuiltIn")}
          bases={builtIn}
          selectedId={selectedId}
          onSelect={onSelect}
        />
        {plugin.length > 0 ? <DropdownMenuSeparator /> : null}
        <BaseThemeGroup
          label={t("settings.appearance.customThemes.basePlugin")}
          bases={plugin}
          selectedId={selectedId}
          onSelect={onSelect}
        />
        {custom.length > 0 ? <DropdownMenuSeparator /> : null}
        <BaseThemeGroup
          label={t("settings.appearance.customThemes.baseCustom")}
          bases={custom}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CustomThemePreview({
  label,
  name,
  colors,
}: {
  label: string;
  name: string;
  colors: EditablePalette;
}) {
  return (
    <View style={styles.previewSection}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View
        style={[styles.preview, { backgroundColor: colors.background, borderColor: colors.border }]}
      >
        <Text style={[styles.previewTitle, { color: colors.foreground }]}>
          {name.trim() || "Aa"}
        </Text>
        <Text style={[styles.previewMuted, { color: colors.mutedForeground }]}>Aa</Text>
        <View
          style={[
            styles.previewCard,
            { backgroundColor: colors.raised, borderColor: colors.border },
          ]}
        >
          <View
            style={[
              styles.previewControl,
              { backgroundColor: colors.control, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.previewText, { color: colors.foreground }]}>Aa</Text>
          </View>
          <View style={[styles.previewAccent, { backgroundColor: colors.accent }]}>
            <Text style={[styles.previewText, { color: colors.background }]}>Aa</Text>
          </View>
          <View style={[styles.previewRing, { borderColor: colors.ring }]} />
        </View>
      </View>
    </View>
  );
}

interface CustomThemesSectionProps {
  catalog: CustomThemeCatalog;
  pluginThemes: PluginThemeOption[];
}

export function CustomThemesSection({ catalog, pluginThemes }: CustomThemesSectionProps) {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const [editor, setEditor] = useState<CustomThemeDraft | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedId = settings.theme === CUSTOM_THEME_PREFERENCE ? settings.customThemeId : null;

  const bases = useMemo<ThemeBase[]>(() => {
    const result: ThemeBase[] = [];
    for (const option of THEME_OPTIONS) {
      if (option.name === "auto") continue;
      result.push({
        id: `builtin:${option.name}`,
        name: t(`settings.appearance.theme.options.${option.name}`),
        appearance: option.theme.colorScheme,
        colors: normalizePalette(paletteFromTheme(option.theme)),
        swatch: option.swatch,
        source: "builtin",
      });
    }
    for (const option of pluginThemes) {
      result.push({
        id: `plugin:${option.id}`,
        name: option.name,
        appearance: option.contribution.appearance,
        colors: normalizePalette(option.contribution.colors),
        swatch: option.swatch,
        source: "plugin",
      });
    }
    for (const option of catalog.options) {
      result.push({
        id: `custom:${option.id}`,
        name: option.name,
        appearance: option.contribution.appearance,
        colors: normalizePalette(paletteFromOption(option)),
        swatch: option.swatch,
        source: "custom",
      });
    }
    return result;
  }, [catalog.options, pluginThemes, t]);

  const startEditor = useCallback((draft: CustomThemeDraft) => {
    setEditorError(null);
    setEditor(draft);
  }, []);

  const openNew = useCallback(() => {
    const base = bases.find((candidate) => candidate.id === "builtin:pontifexDark");
    const template = newCustomThemeTemplate("dark");
    startEditor({
      fileName: null,
      name: template.name,
      appearance: base?.appearance ?? template.appearance,
      colors: base?.colors ?? normalizePalette(template.colors),
      baseId: base?.id ?? null,
      revision: Date.now(),
    });
  }, [bases, startEditor]);

  const openNewFrom = useCallback(
    (base: ThemeBase) => {
      const template = newCustomThemeTemplate(base.appearance);
      startEditor({
        fileName: null,
        name: template.name,
        appearance: base.appearance,
        colors: base.colors,
        baseId: base.id,
        revision: Date.now(),
      });
    },
    [startEditor],
  );

  const openEdit = useCallback(
    (option: CustomThemeOption) => {
      startEditor({
        fileName: option.fileName,
        name: option.name,
        appearance: option.contribution.appearance,
        colors: normalizePalette(paletteFromOption(option)),
        baseId: null,
        revision: Date.now(),
      });
    },
    [startEditor],
  );

  const applyBase = useCallback((base: ThemeBase) => {
    setEditor((current) =>
      current
        ? {
            ...current,
            appearance: base.appearance,
            colors: base.colors,
            baseId: base.id,
          }
        : current,
    );
  }, []);

  const updateColor = useCallback((key: CustomThemeColorKey, value: string) => {
    setEditor((current) =>
      current ? { ...current, colors: { ...current.colors, [key]: value } } : current,
    );
  }, []);

  const updateName = useCallback((name: string) => {
    setEditor((current) => (current ? { ...current, name } : current));
  }, []);

  const updateAppearance = useCallback((appearance: "light" | "dark") => {
    setEditor((current) => (current ? { ...current, appearance } : current));
  }, []);

  const closeEditor = useCallback(() => {
    setEditor(null);
    setEditorError(null);
  }, []);

  const save = useCallback(async () => {
    if (!editor || saving) return;
    const name = editor.name.trim();
    if (!name) {
      setEditorError(t("settings.appearance.customThemes.nameRequired"));
      return;
    }
    setSaving(true);
    setEditorError(null);
    try {
      const file = customThemeFileFromPalette(name, editor.appearance, editor.colors);
      const parsed = parseCustomThemeFile(editor.fileName ?? "new-theme.json", file);
      const fileName =
        editor.fileName ??
        customThemeFileName(parsed.name, new Set(catalog.options.map((option) => option.fileName)));
      await catalog.save(fileName, serializeCustomThemeFile(file));
      setEditor(null);
    } catch (error) {
      setEditorError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }, [catalog, editor, saving, t]);

  const remove = useCallback(
    async (option: CustomThemeOption) => {
      const confirmed = await confirmDialog({
        title: t("settings.appearance.customThemes.deleteConfirmTitle", { name: option.name }),
        message: t("settings.appearance.customThemes.deleteConfirmMessage"),
        confirmLabel: t("settings.appearance.customThemes.delete"),
        destructive: true,
      });
      if (!confirmed) return;
      setListError(null);
      try {
        await catalog.remove(option.fileName);
      } catch (error) {
        setListError(errorMessage(error));
      }
    },
    [catalog, t],
  );

  const removeTheme = useCallback(
    (option: CustomThemeOption) => {
      void remove(option);
    },
    [remove],
  );

  const applyCustomTheme = useCallback(
    (option: CustomThemeOption) => {
      void updateSettings({
        theme: CUSTOM_THEME_PREFERENCE,
        customThemeId: option.id,
      });
    },
    [updateSettings],
  );

  const openFolder = useCallback(async () => {
    setListError(null);
    try {
      await catalog.openFolder();
    } catch (error) {
      setListError(errorMessage(error));
    }
  }, [catalog]);

  const header = useMemo<SheetHeader>(
    () => ({
      title:
        editor?.fileName === null
          ? t("settings.appearance.customThemes.editorTitleNew")
          : t("settings.appearance.customThemes.editorTitleEdit", { name: editor?.name ?? "" }),
      actions: (
        <Button size="sm" onPress={save} loading={saving} disabled={editor === null}>
          {saving
            ? t("settings.appearance.customThemes.saving")
            : t("settings.appearance.customThemes.save")}
        </Button>
      ),
    }),
    [editor, save, saving, t],
  );

  const invalidFiles = catalog.errors.map((error) => `${error.fileName}: ${error.message}`);

  let listContent = null;
  if (catalog.options.length > 0) {
    listContent = (
      <View style={settingsStyles.card}>
        {catalog.options.map((option, index) => (
          <CustomThemeRow
            key={option.id}
            option={option}
            selected={selectedId === option.id}
            withBorder={index > 0}
            onUse={applyCustomTheme}
            onEdit={openEdit}
            onDelete={removeTheme}
          />
        ))}
      </View>
    );
  } else if (!catalog.loading) {
    listContent = (
      <SettingsCard>
        <Text style={styles.state}>{t("settings.appearance.customThemes.empty")}</Text>
      </SettingsCard>
    );
  }

  return (
    <SettingsSection title={t("settings.appearance.customThemes.title")}>
      <View style={settingsStyles.card}>
        <SettingsRow
          label={t("settings.appearance.customThemes.title")}
          hint={t("settings.appearance.customThemes.description")}
        >
          <View style={styles.headerActions}>
            <Button variant="outline" size="sm" onPress={openFolder}>
              {t("settings.appearance.customThemes.openFolder")}
            </Button>
            <Button variant="outline" size="sm" onPress={catalog.refresh}>
              {t("settings.appearance.customThemes.refresh")}
            </Button>
            <BaseThemeMenu
              bases={bases}
              selectedId={null}
              onSelect={openNewFrom}
              placeholder={t("settings.appearance.customThemes.newFromTheme")}
            />
            <Button size="sm" onPress={openNew}>
              {t("settings.appearance.customThemes.newTheme")}
            </Button>
          </View>
        </SettingsRow>
      </View>
      {catalog.loading ? (
        <Text style={styles.state}>{t("settings.appearance.customThemes.loading")}</Text>
      ) : null}
      {catalog.error ? (
        <Alert
          size="sm"
          variant="error"
          title={t("settings.appearance.customThemes.loadError")}
          description={errorMessage(catalog.error)}
        />
      ) : null}
      {invalidFiles.length > 0 ? (
        <Alert
          size="sm"
          variant="warning"
          title={t("settings.appearance.customThemes.invalidFiles")}
          description={invalidFiles.join("\n")}
        />
      ) : null}
      {listError ? <Alert size="sm" variant="error" title={listError} /> : null}
      {listContent}
      {editor ? (
        <AdaptiveModalSheet header={header} visible onClose={closeEditor} desktopMaxWidth={560}>
          <View style={styles.editor}>
            <Text style={settingsStyles.rowHint}>
              {t("settings.appearance.customThemes.editorHint")}
            </Text>
            <CustomThemePreview
              label={t("settings.appearance.customThemes.preview")}
              name={editor.name}
              colors={editor.colors}
            />
            {editorError ? <Alert size="sm" variant="error" title={editorError} /> : null}
            {editor.fileName === null ? (
              <View style={styles.fieldRow}>
                <View style={styles.fieldInfo}>
                  <Text style={styles.fieldLabel}>
                    {t("settings.appearance.customThemes.baseTheme")}
                  </Text>
                  <Text style={settingsStyles.rowHint}>
                    {t("settings.appearance.customThemes.baseThemeHint")}
                  </Text>
                </View>
                <BaseThemeMenu bases={bases} selectedId={editor.baseId} onSelect={applyBase} />
              </View>
            ) : null}
            <View style={styles.fieldRow}>
              <View style={styles.fieldInfo}>
                <Text style={styles.fieldLabel}>{t("settings.appearance.customThemes.name")}</Text>
              </View>
              <EditingTextInput
                key={editor.revision}
                initialValue={editor.name}
                onChangeText={updateName}
                placeholder={t("settings.appearance.customThemes.namePlaceholder")}
                maxLength={60}
                autoCorrect={false}
                style={styles.nameInput}
                accessibilityLabel={t("settings.appearance.customThemes.name")}
              />
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.fieldInfo}>
                <Text style={styles.fieldLabel}>
                  {t("settings.appearance.customThemes.appearance")}
                </Text>
              </View>
              <AppearanceMenu value={editor.appearance} onChange={updateAppearance} />
            </View>
            <View style={styles.colors}>
              {CUSTOM_THEME_COLOR_KEYS.map((key) => (
                <ColorSlotRow
                  key={key}
                  colorKey={key}
                  value={editor.colors[key]}
                  onChange={updateColor}
                />
              ))}
            </View>
          </View>
        </AdaptiveModalSheet>
      ) : null}
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  state: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  themeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  themeRowBorder: {
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
  },
  themeInfo: {
    flex: 1,
    minWidth: 0,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  selectedLabel: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[2],
  },
  editor: {
    padding: theme.spacing[4],
    gap: theme.spacing[4],
  },
  previewSection: {
    gap: theme.spacing[2],
  },
  sectionLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  preview: {
    borderWidth: theme.borderWidth[1],
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  previewTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.medium,
  },
  previewMuted: {
    fontSize: theme.fontSize.base,
  },
  previewText: {
    fontSize: theme.fontSize.base,
  },
  previewCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    borderWidth: theme.borderWidth[1],
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[2],
  },
  previewControl: {
    borderWidth: theme.borderWidth[1],
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  previewAccent: {
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  previewRing: {
    width: 28,
    height: 20,
    borderWidth: 2,
    borderRadius: theme.borderRadius.sm,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  fieldInfo: {
    flex: 1,
    gap: theme.spacing[1],
  },
  fieldLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  nameInput: {
    width: 220,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  colors: {
    gap: theme.spacing[1],
  },
}));
