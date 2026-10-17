/**
 * Filtering for the settings index.
 *
 * A destination matches when every whitespace-separated token in the query appears in its
 * localized label or one of its keywords. Labels name the destination ("Editor", "Usage"), which is
 * rarely the word someone types — nobody searches "Editor" for keybindings — so the keyword list
 * carries the synonyms.
 */
export interface SettingsSearchTarget {
  labelKey: string;
  keywords?: readonly string[];
}

export function matchesSettingsSearch(
  query: string,
  target: SettingsSearchTarget,
  translate: (key: string) => string,
): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = [translate(target.labelKey), ...(target.keywords ?? [])].join(" ").toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function filterSettingsTargets<T extends SettingsSearchTarget>(
  query: string,
  targets: readonly T[],
  translate: (key: string) => string,
): T[] {
  return targets.filter((target) => matchesSettingsSearch(query, target, translate));
}
