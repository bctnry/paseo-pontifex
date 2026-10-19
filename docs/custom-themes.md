# Custom Themes

Desktop users can add themes as JSON files. This is the non-plugin path for a personal palette: no plugin install, no daemon involvement, no code execution. Mobile and browser builds do not load these files.

The built-in **Pontifex Light** and **Pontifex Dark** themes use the same eight-slot palette. **New theme** starts from Pontifex Dark, so the default custom theme and the built-in dark theme share a palette.

## Where the files live

Themes live in the Electron `userData` directory under `themes/`:

- Linux: `~/.config/Paseo/themes/`
- macOS: `~/Library/Application Support/Paseo/themes/`
- Windows: `%APPDATA%\Paseo\themes\`

Use **Settings → Appearance → Custom themes → Open themes folder** to open it. The app creates the directory on first use.

## File format

One JSON file per theme. The file name without `.json` is the theme ID, so `ocean.json` has the ID `ocean`. Renaming the display name in the editor does not rename the file. Renaming the file changes the ID, so reselect the theme afterward.

```json
{
  "version": 1,
  "name": "Ocean",
  "appearance": "dark",
  "colors": {
    "background": "#081018",
    "foreground": "#e6edf3",
    "raised": "#101b26",
    "control": "#172635",
    "border": "#284052",
    "accent": "#38bdf8",
    "mutedForeground": "#94a3b8",
    "ring": "#7dd3fc"
  }
}
```

`appearance` is `light` or `dark`. Colors are hex strings (`#rgb`, `#rrggbb`, or `#rrggbbaa`). `accent` and `version` are optional; every other color is required. Unknown keys are rejected so a typo does not silently produce a half-themed palette.

Paseo expands the palette through `buildThemeFromPalette`, the same semantic builder used by plugin themes and the built-in Pontifex themes. The palette is not a full token contract: `raised` and `control` are surfaces, `border` is only the line between them, `ring` is the focus ring, and `mutedForeground` is secondary text. Surface3 and surface4 are derived from `control` toward the foreground, so the border slot does not become a button background. Extra-muted text and terminal bright black are also derived.

## Select and edit

The theme picker lists **Pontifex Light** and **Pontifex Dark** with the built-in themes, and custom themes after built-in and plugin themes. Selecting a custom theme writes `theme: "custom"` plus `customThemeId`, where the ID is the file name without `.json`.

The **Custom themes** section lists valid files, marks the selected one, and has **New theme**, **Edit**, **Delete**, **Refresh**, and **Open themes folder**.

The editor has a live preview, a name field, light/dark selection, and one row per palette slot. Each row has a swatch that opens the system color picker and a hex field for exact values. **New from theme…** starts a new theme from any built-in, plugin, or custom palette. **New theme** starts from Pontifex Dark. The editor also shows **Base theme** for a new theme, so you can switch the starting palette before editing. Saving validates the file, rewrites it as formatted JSON, and reloads the catalog. A file that fails validation stays on disk and appears under **Theme files with errors**; the rest still load.

Editing a file outside the app also works. The main process watches the themes directory and tells the renderer to reload, and **Refresh** forces a reread.

## Startup

A custom theme is read through IPC, so the first paint cannot wait for it. Like plugin themes, the selected custom contribution is cached in `localStorage` and restored into the reserved Unistyles light/dark slots before `StyleSheet.configure`. The provider uses the cache until the file catalog resolves, then replaces it with the file contents or falls back if the file is gone. See [unistyles.md](unistyles.md#adaptive-themes-and-persisted-settings).

The first launch after selecting a custom theme uses the adaptive theme until the cache is written. Later launches restore it immediately.

## Implementation

- `packages/desktop/src/features/theme-store.ts` owns file access: name validation, atomic writes, the 256 KiB limit, and listing. `themes.ts` owns the IPC handlers, folder opener, and directory watcher.
- `packages/desktop/src/preload.ts` exposes only `list`, `read`, `save`, `remove`, `openFolder`, and `onChanged` under `themes`. The renderer cannot read arbitrary paths.
- `packages/app/src/styles/theme.ts` owns `buildThemeFromPalette` and the built-in Pontifex themes. `theme-palettes.ts` holds the shared slot values.
- `packages/app/src/styles/custom-theme.ts` parses and serializes the file format and exposes palette extraction for the base-theme picker.
- `packages/app/src/appearance/custom-themes.ts` loads the catalog with React Query, subscribes to change events, and exposes save/remove/open-folder actions.
- `packages/app/src/screens/settings/appearance/custom-themes-section.tsx` is the list and structured editor. `theme-color-picker.web.tsx` opens the system picker through a hidden `<input type="color">`; the base file keeps the hex field usable on native.
