import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
  SidebarWorkspacePlacement,
} from "@/hooks/use-sidebar-workspaces-list";

export interface SidebarSearchProjectResult {
  kind: "project";
  id: string;
  projectViewKey: string;
  projectName: string;
  workspaceCount: number;
  score: number;
}

export interface SidebarSearchWorkspaceResult {
  kind: "workspace";
  id: string;
  projectViewKey: string;
  projectName: string;
  workspaceKey: string;
  serverId: string;
  workspaceId: string;
  title: string;
  detail: string;
  score: number;
}

export type SidebarSearchResult = SidebarSearchProjectResult | SidebarSearchWorkspaceResult;

export interface SidebarSearchInput {
  projects: readonly SidebarProjectEntry[];
  workspaceEntriesByKey?: ReadonlyMap<string, SidebarWorkspaceEntry>;
  query: string;
  limit?: number;
}

const DEFAULT_LIMIT = 80;

function normalize(value: string | null | undefined): string {
  return value?.toLocaleLowerCase() ?? "";
}

function workspaceHaystack(input: {
  project: SidebarProjectEntry;
  workspace: SidebarWorkspacePlacement;
  entry: SidebarWorkspaceEntry | undefined;
}): string[] {
  const { project, workspace, entry } = input;
  return [
    project.projectName,
    workspace.projectName,
    workspace.name,
    workspace.workspaceId,
    workspace.workspaceKey,
    workspace.workspaceDirectory,
    entry?.title,
    entry?.currentBranch,
    entry?.workspaceDirectory,
    entry?.workspaceDirectoryLabel,
    ...(entry?.labels ?? []),
  ].flatMap((value) => (typeof value === "string" && value.length > 0 ? [normalize(value)] : []));
}

/**
 * Tokens are ANDed so a query can cross fields: "api main" finds the main worktree of the api
 * project. Every token has to appear somewhere in the row's haystack, but no token has to appear
 * in a particular field.
 */
function matchesTokens(haystack: readonly string[], tokens: readonly string[]): boolean {
  return tokens.every((token) => haystack.some((value) => value.includes(token)));
}

function projectScore(projectName: string, tokens: readonly string[]): number {
  const name = normalize(projectName);
  if (tokens.length === 0) return 1;
  if (tokens.every((token) => name.includes(token))) return 3;
  return 2;
}

function workspaceScore(input: {
  projectName: string;
  workspaceTitle: string;
  haystack: readonly string[];
  tokens: readonly string[];
}): number {
  if (input.tokens.length === 0) return 1;
  const title = normalize(input.workspaceTitle);
  if (input.tokens.every((token) => title.includes(token))) return 4;
  if (input.tokens.every((token) => normalize(input.projectName).includes(token))) return 2;
  return 3;
}

/** Projects and workspaces whose names, titles, branches, paths, or labels match the query. */
export function searchSidebar(input: SidebarSearchInput): SidebarSearchResult[] {
  const tokens = normalize(input.query)
    .split(/\s+/)
    .filter((token) => token.length > 0);
  const results: SidebarSearchResult[] = [];

  for (const project of input.projects) {
    const projectHaystack = [normalize(project.projectName)];
    if (matchesTokens(projectHaystack, tokens)) {
      results.push({
        kind: "project",
        id: `project:${project.viewKey}`,
        projectViewKey: project.viewKey,
        projectName: project.projectName,
        workspaceCount: project.workspaces.length,
        score: projectScore(project.projectName, tokens),
      });
    }

    for (const workspace of project.workspaces) {
      const entry = input.workspaceEntriesByKey?.get(workspace.workspaceKey);
      const haystack = workspaceHaystack({ project, workspace, entry });
      if (!matchesTokens(haystack, tokens)) continue;
      const title = entry?.title ?? workspace.name;
      results.push({
        kind: "workspace",
        id: `workspace:${workspace.workspaceKey}`,
        projectViewKey: project.viewKey,
        projectName: project.projectName,
        workspaceKey: workspace.workspaceKey,
        serverId: workspace.serverId,
        workspaceId: workspace.workspaceId,
        title,
        detail: entry?.currentBranch ?? entry?.workspaceDirectoryLabel ?? workspace.name,
        score: workspaceScore({
          projectName: project.projectName,
          workspaceTitle: title,
          haystack,
          tokens,
        }),
      });
    }
  }

  results.sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    if (left.kind !== right.kind) return left.kind === "project" ? -1 : 1;
    const leftName = left.kind === "project" ? left.projectName : left.title;
    const rightName = right.kind === "project" ? right.projectName : right.title;
    return (
      leftName.localeCompare(rightName, undefined, { numeric: true, sensitivity: "base" }) ||
      left.id.localeCompare(right.id)
    );
  });

  return results.slice(0, input.limit ?? DEFAULT_LIMIT);
}
