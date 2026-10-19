// Presentational pieces of the registry screen.
//
// react-perf rules require stable props: handlers arrive from the parent or are
// wrapped in `useCallback` here, and every style is a `styles` entry. Rows are
// separate components for the same reason: an inline arrow in a `.map` would be
// a new function prop on every render.
import { useCallback, type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type {
  BroadcastEntry,
  Capability,
  CapabilityVerification,
  OperatorBinding,
  OperatorStatus,
  ProjectMember,
  ProjectWorkspace,
  ProviderInfo,
  ProviderModel,
  RegistryEvent,
  RegistryProject,
  Resource,
} from "../shared/model.js";
import type { Styles } from "./styles.js";

export function Chip({
  styles,
  label,
  variant,
  onPress,
  disabled,
}: {
  styles: Styles;
  label: string;
  variant: "work" | "neutral";
  onPress?: () => void;
  disabled?: boolean;
}) {
  const isWork = variant === "work";
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={isWork ? styles.chipWork : styles.chipNeutral}
    >
      <Text style={isWork ? styles.chipLabelWork : styles.chipLabel}>{label}</Text>
    </Pressable>
  );
}

export function SelectChip({
  styles,
  label,
  value,
  selected,
  onSelect,
}: {
  styles: Styles;
  label: string;
  value: string;
  selected: boolean;
  onSelect: (value: string) => void;
}) {
  const handlePress = useCallback(() => onSelect(value), [onSelect, value]);
  return (
    <Chip
      styles={styles}
      label={label}
      variant={selected ? "work" : "neutral"}
      onPress={handlePress}
    />
  );
}

/** `1 project` / `3 projects`, with an explicit plural where `s` is wrong. */
function count(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
}

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

function TabButton({
  styles,
  item,
  active,
  onSelect,
}: {
  styles: Styles;
  item: TabItem;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const handlePress = useCallback(() => onSelect(item.id), [item.id, onSelect]);
  return (
    <Pressable style={active ? styles.tabItemActive : styles.tabItem} onPress={handlePress}>
      <Text style={active ? styles.tabLabelActive : styles.tabLabel}>{item.label}</Text>
      {item.count === undefined ? null : (
        <Text style={active ? styles.tabCountActive : styles.tabCount}>{String(item.count)}</Text>
      )}
    </Pressable>
  );
}

export function TabBar({
  styles,
  tabs,
  activeTab,
  onSelect,
}: {
  styles: Styles;
  tabs: ReadonlyArray<TabItem>;
  activeTab: string;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.tabBar}>
      {tabs.map((item) => (
        <TabButton
          key={item.id}
          styles={styles}
          item={item}
          active={item.id === activeTab}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

/**
 * Renders its children only while it is the active tab. Keeping the selection
 * here rather than as a ternary per pane keeps the screen component's branching
 * inside the lint budget.
 */
export function TabPane({
  active,
  id,
  children,
}: {
  active: string;
  id: string;
  children: ReactNode;
}) {
  if (active !== id) return null;
  return children;
}

/** Placeholder for a tab that needs a project before it can show anything. */
export function HintCard({ styles, message }: { styles: Styles; message: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.empty}>{message}</Text>
    </View>
  );
}

function Stat({ styles, label, value }: { styles: Styles; label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function HeaderCard({
  styles,
  hostLabel,
  hostId,
  schemaVersion,
  resourceCount,
  projectCount,
}: {
  styles: Styles;
  hostLabel: string;
  hostId: string;
  schemaVersion: number;
  resourceCount: number;
  projectCount: number;
}) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroBody}>
        <Text style={styles.heroTitle}>Lingus registry</Text>
        <Text style={styles.muted}>
          Resources, projects and capability tokens owned by this host.
        </Text>
        <Text style={styles.heroMeta}>
          host {hostLabel} · {hostId}
        </Text>
      </View>
      <View style={styles.statRow}>
        <Stat styles={styles} label="resources" value={String(resourceCount)} />
        <Stat styles={styles} label="projects" value={String(projectCount)} />
        <Stat styles={styles} label="schema" value={`v${schemaVersion}`} />
      </View>
    </View>
  );
}

export function ErrorCard({ styles, message }: { styles: Styles; message: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.danger}>{message}</Text>
    </View>
  );
}

function CardHeader({
  styles,
  title,
  meta,
  actionLabel,
  actionDisabled,
  onAction,
}: {
  styles: Styles;
  title: string;
  meta: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
}) {
  const handleAction = useCallback(() => {
    if (onAction) onAction();
  }, [onAction]);
  return (
    <View style={styles.cardHeader}>
      <View style={styles.grow}>
        <Text style={styles.cardTitle}>{title}</Text>
        {meta === "" ? null : <Text style={styles.cardMeta}>{meta}</Text>}
      </View>
      {actionLabel ? (
        <Chip
          styles={styles}
          label={actionLabel}
          variant="neutral"
          onPress={handleAction}
          disabled={actionDisabled === true}
        />
      ) : null}
    </View>
  );
}

function ResourceForm({
  styles,
  name,
  kind,
  placeholderColor,
  pending,
  onChangeName,
  onChangeKind,
  onSubmit,
}: {
  styles: Styles;
  name: string;
  kind: string;
  placeholderColor: string;
  pending: boolean;
  onChangeName: (value: string) => void;
  onChangeKind: (value: string) => void;
  onSubmit: (name: string, kind: string) => void;
}) {
  const handleSubmit = useCallback(
    () => onSubmit(name.trim(), kind.trim()),
    [kind, name, onSubmit],
  );
  const disabled = name.trim() === "" || kind.trim() === "" || pending;
  return (
    <View style={styles.row}>
      <TextInput
        style={styles.input}
        placeholder="resource name"
        placeholderTextColor={placeholderColor}
        value={name}
        onChangeText={onChangeName}
      />
      <TextInput
        style={styles.input}
        placeholder="kind"
        placeholderTextColor={placeholderColor}
        value={kind}
        onChangeText={onChangeKind}
        autoCapitalize="none"
      />
      <Pressable style={styles.primary} disabled={disabled} onPress={handleSubmit}>
        <Text style={styles.primaryText}>Add</Text>
      </Pressable>
    </View>
  );
}

function describeResource(resource: Resource): string {
  const parts = [resource.kind, resource.locality];
  if (resource.builtin) parts.push("builtin");
  return parts.join(" · ");
}

function ResourceRow({
  styles,
  resource,
  pending,
  onToggleClass,
}: {
  styles: Styles;
  resource: Resource;
  pending: boolean;
  onToggleClass: (id: string, next: "private" | "work") => void;
}) {
  const isWork = resource.class === "work";
  const handleToggle = useCallback(
    () => onToggleClass(resource.id, isWork ? "private" : "work"),
    [isWork, onToggleClass, resource.id],
  );
  return (
    <View style={styles.listItem}>
      <View style={styles.grow}>
        <Text style={styles.itemTitle}>{resource.name}</Text>
        <Text style={styles.muted}>{describeResource(resource)}</Text>
      </View>
      <Chip
        styles={styles}
        label={isWork ? "work" : "private"}
        variant={isWork ? "work" : "neutral"}
        onPress={handleToggle}
        disabled={pending}
      />
    </View>
  );
}

export function ResourcesCard({
  styles,
  resources,
  name,
  kind,
  placeholderColor,
  pending,
  onChangeName,
  onChangeKind,
  onCreate,
  onToggleClass,
}: {
  styles: Styles;
  resources: Resource[];
  name: string;
  kind: string;
  placeholderColor: string;
  pending: boolean;
  onChangeName: (value: string) => void;
  onChangeKind: (value: string) => void;
  onCreate: (name: string, kind: string) => void;
  onToggleClass: (id: string, next: "private" | "work") => void;
}) {
  return (
    <View style={styles.card}>
      <CardHeader
        styles={styles}
        title="Resources"
        meta={`${count(resources.length, "resource")} registered · class decides whether peers can see them`}
      />
      <ResourceForm
        styles={styles}
        name={name}
        kind={kind}
        placeholderColor={placeholderColor}
        pending={pending}
        onChangeName={onChangeName}
        onChangeKind={onChangeKind}
        onSubmit={onCreate}
      />
      {resources.map((resource) => (
        <ResourceRow
          key={resource.id}
          styles={styles}
          resource={resource}
          pending={pending}
          onToggleClass={onToggleClass}
        />
      ))}
      {resources.length === 0 ? (
        <Text style={styles.empty}>No resources registered yet.</Text>
      ) : null}
    </View>
  );
}

function ProjectForm({
  styles,
  name,
  placeholderColor,
  pending,
  onChangeName,
  onSubmit,
}: {
  styles: Styles;
  name: string;
  placeholderColor: string;
  pending: boolean;
  onChangeName: (value: string) => void;
  onSubmit: (name: string) => void;
}) {
  const handleSubmit = useCallback(() => onSubmit(name.trim()), [name, onSubmit]);
  return (
    <View style={styles.row}>
      <TextInput
        style={styles.input}
        placeholder="project name"
        placeholderTextColor={placeholderColor}
        value={name}
        onChangeText={onChangeName}
      />
      <Pressable
        style={styles.primary}
        disabled={name.trim() === "" || pending}
        onPress={handleSubmit}
      >
        <Text style={styles.primaryText}>Create</Text>
      </Pressable>
    </View>
  );
}

function ProjectRow({
  styles,
  project,
  selected,
  onOpen,
}: {
  styles: Styles;
  project: RegistryProject;
  selected: boolean;
  onOpen: (id: string) => void;
}) {
  const handleOpen = useCallback(() => onOpen(project.id), [onOpen, project.id]);
  return (
    <Pressable style={styles.listItem} onPress={handleOpen}>
      <View style={styles.grow}>
        <Text style={styles.itemTitle}>{project.name}</Text>
        <Text style={styles.mono}>{project.id}</Text>
      </View>
      <Chip styles={styles} label={selected ? "selected" : "open"} variant="neutral" />
    </Pressable>
  );
}

export function ProjectsCard({
  styles,
  projects,
  name,
  selectedProjectId,
  placeholderColor,
  pending,
  onChangeName,
  onCreate,
  onOpen,
}: {
  styles: Styles;
  projects: RegistryProject[];
  name: string;
  selectedProjectId: string | null;
  placeholderColor: string;
  pending: boolean;
  onChangeName: (value: string) => void;
  onCreate: (name: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <View style={styles.card}>
      <CardHeader
        styles={styles}
        title="Projects"
        meta={`${count(projects.length, "project")} · members, operators and capabilities hang off these`}
      />
      <ProjectForm
        styles={styles}
        name={name}
        placeholderColor={placeholderColor}
        pending={pending}
        onChangeName={onChangeName}
        onSubmit={onCreate}
      />
      {projects.map((project) => (
        <ProjectRow
          key={project.id}
          styles={styles}
          project={project}
          selected={selectedProjectId === project.id}
          onOpen={onOpen}
        />
      ))}
      {projects.length === 0 ? <Text style={styles.empty}>No projects yet.</Text> : null}
    </View>
  );
}

function BindWorkspaceForm({
  styles,
  value,
  placeholderColor,
  pending,
  onChangeValue,
  onSubmit,
}: {
  styles: Styles;
  value: string;
  placeholderColor: string;
  pending: boolean;
  onChangeValue: (value: string) => void;
  onSubmit: (workspaceId: string) => void;
}) {
  const handleSubmit = useCallback(() => onSubmit(value.trim()), [onSubmit, value]);
  return (
    <View style={styles.row}>
      <TextInput
        style={styles.input}
        placeholder="wks_…"
        placeholderTextColor={placeholderColor}
        value={value}
        onChangeText={onChangeValue}
        autoCapitalize="none"
      />
      <Pressable
        style={styles.primary}
        disabled={value.trim() === "" || pending}
        onPress={handleSubmit}
      >
        <Text style={styles.primaryText}>Bind</Text>
      </Pressable>
    </View>
  );
}

function WorkspaceRow({ styles, workspace }: { styles: Styles; workspace: ProjectWorkspace }) {
  return (
    <View style={styles.listItem}>
      <View style={styles.grow}>
        <Text style={styles.mono}>{workspace.workspaceId}</Text>
        {workspace.role === null ? null : <Text style={styles.muted}>{workspace.role}</Text>}
      </View>
    </View>
  );
}

function MemberRow({
  styles,
  member,
  resource,
}: {
  styles: Styles;
  member: ProjectMember;
  resource: Resource | undefined;
}) {
  return (
    <View style={styles.listItem}>
      <View style={styles.grow}>
        <Text style={styles.itemTitle}>{resource ? resource.name : member.resourceId}</Text>
        <Text style={styles.mono}>allocation {JSON.stringify(member.allocation)}</Text>
      </View>
    </View>
  );
}

function AddMemberChip({
  styles,
  resource,
  pending,
  onAdd,
}: {
  styles: Styles;
  resource: Resource;
  pending: boolean;
  onAdd: (resourceId: string) => void;
}) {
  const handleAdd = useCallback(() => onAdd(resource.id), [onAdd, resource.id]);
  return (
    <Chip
      styles={styles}
      label={`+ ${resource.name}`}
      variant="neutral"
      onPress={handleAdd}
      disabled={pending}
    />
  );
}

export function ProjectDetail({
  styles,
  title,
  memberCount,
  workspaceValue,
  placeholderColor,
  workspaces,
  members,
  resources,
  addable,
  bindPending,
  addPending,
  onChangeWorkspace,
  onBindWorkspace,
  onAddMember,
}: {
  styles: Styles;
  title: string;
  memberCount: number;
  workspaceValue: string;
  placeholderColor: string;
  workspaces: ProjectWorkspace[];
  members: ProjectMember[];
  resources: Resource[];
  addable: Resource[];
  bindPending: boolean;
  addPending: boolean;
  onChangeWorkspace: (value: string) => void;
  onBindWorkspace: (workspaceId: string) => void;
  onAddMember: (resourceId: string) => void;
}) {
  return (
    <View style={styles.card}>
      <CardHeader
        styles={styles}
        title={title}
        meta={`${count(memberCount, "member")} · ${count(workspaces.length, "workspace")}`}
      />

      <Text style={styles.sectionTitle}>paseo workspaces</Text>
      {workspaces.map((workspace) => (
        <WorkspaceRow key={workspace.workspaceId} styles={styles} workspace={workspace} />
      ))}
      {workspaces.length === 0 ? (
        <Text style={styles.empty}>No workspace bound; an operator needs one.</Text>
      ) : null}
      <BindWorkspaceForm
        styles={styles}
        value={workspaceValue}
        placeholderColor={placeholderColor}
        pending={bindPending}
        onChangeValue={onChangeWorkspace}
        onSubmit={onBindWorkspace}
      />

      <Text style={styles.sectionTitle}>members</Text>
      {members.map((member) => (
        <MemberRow
          key={member.resourceId}
          styles={styles}
          member={member}
          resource={resources.find((resource) => resource.id === member.resourceId)}
        />
      ))}
      {members.length === 0 ? (
        <Text style={styles.empty}>No members; a capability needs a member resource.</Text>
      ) : null}
      <View style={styles.chipRow}>
        {addable.map((resource) => (
          <AddMemberChip
            key={resource.id}
            styles={styles}
            resource={resource}
            pending={addPending}
            onAdd={onAddMember}
          />
        ))}
      </View>
    </View>
  );
}

function operatorLabel(operator: OperatorBinding): string {
  const short = shortId(operator.id);
  return operator.role ? `${operator.role} · ${short}` : short;
}

function describeOperator(operator: OperatorBinding): string {
  const parts = [shortId(operator.id), operator.status];
  if (operator.workspaceId) parts.push(shortId(operator.workspaceId));
  return parts.join(" · ");
}

function OperatorRow({
  styles,
  operator,
  pending,
  onToggleStatus,
}: {
  styles: Styles;
  operator: OperatorBinding;
  pending: boolean;
  onToggleStatus: (id: string, status: OperatorStatus) => void;
}) {
  const isActive = operator.status === "active";
  const handleToggle = useCallback(
    () => onToggleStatus(operator.id, isActive ? "suspended" : "active"),
    [isActive, onToggleStatus, operator.id],
  );
  return (
    <View style={styles.listItem}>
      <View style={styles.grow}>
        <Text style={styles.itemTitle}>{operator.role ?? "operator"}</Text>
        <Text style={styles.muted}>{describeOperator(operator)}</Text>
      </View>
      <Chip
        styles={styles}
        label={isActive ? "suspend" : "activate"}
        variant="neutral"
        onPress={handleToggle}
        disabled={pending}
      />
    </View>
  );
}

export function OperatorPanel({
  styles,
  title,
  errorMessage,
  canBind,
  providers,
  models,
  modelsPending,
  workspaces,
  selectedWorkspace,
  selectedProvider,
  selectedModel,
  roleValue,
  sessionValue,
  placeholderColor,
  pending,
  operators,
  onSelectProvider,
  onSelectModel,
  onSelectWorkspace,
  onChangeRole,
  onChangeSession,
  onCreate,
  onBackfill,
  onToggleStatus,
}: {
  styles: Styles;
  title: string;
  errorMessage: string | null;
  canBind: boolean;
  providers: ProviderInfo[];
  models: ProviderModel[];
  modelsPending: boolean;
  workspaces: ProjectWorkspace[];
  selectedWorkspace: string;
  selectedProvider: string;
  selectedModel: string;
  roleValue: string;
  sessionValue: string;
  placeholderColor: string;
  pending: boolean;
  operators: OperatorBinding[];
  onSelectProvider: (value: string) => void;
  onSelectModel: (value: string) => void;
  onSelectWorkspace: (value: string) => void;
  onChangeRole: (value: string) => void;
  onChangeSession: (value: string) => void;
  onCreate: () => void;
  onBackfill: () => void;
  onToggleStatus: (id: string, status: OperatorStatus) => void;
}) {
  const canCreate = canBind && selectedProvider !== "" && selectedModel !== "" && !pending;
  const canBackfill = canBind && sessionValue.trim() !== "" && !pending;
  return (
    <View style={styles.card}>
      <CardHeader
        styles={styles}
        title={title}
        meta={`${count(operators.length, "operator")} bound`}
      />
      {errorMessage ? <Text style={styles.danger}>{errorMessage}</Text> : null}

      <Text style={styles.sectionTitle}>new paseo agent session</Text>
      {workspaces.length > 1 ? (
        <>
          <Text style={styles.fieldLabel}>workspace</Text>
          <View style={styles.chipRow}>
            {workspaces.map((workspace) => (
              <SelectChip
                key={workspace.workspaceId}
                styles={styles}
                label={workspace.role ?? shortId(workspace.workspaceId)}
                value={workspace.workspaceId}
                selected={workspace.workspaceId === selectedWorkspace}
                onSelect={onSelectWorkspace}
              />
            ))}
          </View>
        </>
      ) : null}
      <Text style={styles.fieldLabel}>provider</Text>
      <View style={styles.chipRow}>
        {providers.map((provider) => (
          <SelectChip
            key={provider.id}
            styles={styles}
            label={provider.id}
            value={provider.id}
            selected={provider.id === selectedProvider}
            onSelect={onSelectProvider}
          />
        ))}
      </View>
      {selectedProvider === "" ? <Text style={styles.muted}>Pick a provider.</Text> : null}
      {selectedProvider !== "" ? (
        <View style={styles.chipRow}>
          {models.map((model) => (
            <SelectChip
              key={model.id}
              styles={styles}
              label={model.label}
              value={model.id}
              selected={model.id === selectedModel}
              onSelect={onSelectModel}
            />
          ))}
        </View>
      ) : null}
      {selectedProvider !== "" && modelsPending ? (
        <Text style={styles.muted}>Loading models…</Text>
      ) : null}
      {selectedProvider !== "" && !modelsPending && models.length === 0 ? (
        <Text style={styles.muted}>This provider reports no models.</Text>
      ) : null}
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="role (optional), e.g. builder"
          placeholderTextColor={placeholderColor}
          value={roleValue}
          onChangeText={onChangeRole}
        />
        <Pressable style={styles.primary} disabled={!canCreate} onPress={onCreate}>
          <Text style={styles.primaryText}>Create operator</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>bind an existing session</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="agent session id"
          placeholderTextColor={placeholderColor}
          value={sessionValue}
          onChangeText={onChangeSession}
          autoCapitalize="none"
        />
        <Pressable style={styles.primary} disabled={!canBackfill} onPress={onBackfill}>
          <Text style={styles.primaryText}>Bind existing</Text>
        </Pressable>
      </View>
      {canBind ? null : (
        <Text style={styles.muted}>
          Bind a paseo workspace to the project first (invariant I11).
        </Text>
      )}

      <Text style={styles.sectionTitle}>operators</Text>
      {operators.map((operator) => (
        <OperatorRow
          key={operator.id}
          styles={styles}
          operator={operator}
          pending={pending}
          onToggleStatus={onToggleStatus}
        />
      ))}
      {operators.length === 0 ? <Text style={styles.empty}>No operators bound yet.</Text> : null}
    </View>
  );
}

/** Last eight characters of an id: enough to tell two of them apart in a chip. */
function shortId(id: string): string {
  const local = id.split("/").pop() ?? id;
  return `…${local.slice(-8)}`;
}

function resourceLabel(resourceId: string, resources: Resource[]): string {
  return resources.find((resource) => resource.id === resourceId)?.name ?? shortId(resourceId);
}

function describeCapability(capability: Capability): string {
  const parts = [capability.kind, shortId(capability.subject), shortId(capability.id)];
  if (capability.revokedAt !== null) {
    parts.push(`revoked: ${capability.revokedReason ?? "unknown"}`);
  } else if (capability.expiresAt !== null) {
    parts.push(`expires ${formatTime(capability.expiresAt)}`);
  } else {
    parts.push("no expiry");
  }
  return parts.join(" · ");
}

function CapabilityRow({
  styles,
  capability,
  resourceName,
  pending,
  onRevoke,
}: {
  styles: Styles;
  capability: Capability;
  resourceName: string;
  pending: boolean;
  onRevoke: (id: string) => void;
}) {
  const revoked = capability.revokedAt !== null;
  const handleRevoke = useCallback(() => onRevoke(capability.id), [capability.id, onRevoke]);
  return (
    <View style={styles.listItem}>
      <View style={styles.grow}>
        <Text style={styles.itemTitle}>{resourceName}</Text>
        <Text style={styles.muted}>{describeCapability(capability)}</Text>
      </View>
      {revoked ? null : (
        <Chip
          styles={styles}
          label="revoke"
          variant="neutral"
          onPress={handleRevoke}
          disabled={pending}
        />
      )}
    </View>
  );
}

/**
 * Issuing is deliberately explicit: the subject picker only lists active
 * operators and the resource picker only lists project members, which are the
 * two facts issuance checks. Scope stays a JSON field because it is free-form by
 * design; the server refuses anything wider than the member's allocation.
 */
export function CapabilityPanel({
  styles,
  title,
  errorMessage,
  resources,
  subjects,
  capabilities,
  issuedToken,
  selectedSubject,
  selectedResource,
  selectedKind,
  scopeValue,
  ttlValue,
  placeholderColor,
  pending,
  onSelectSubject,
  onSelectResource,
  onSelectKind,
  onChangeScope,
  onChangeTtl,
  onIssue,
  onRevoke,
}: {
  styles: Styles;
  title: string;
  errorMessage: string | null;
  resources: Resource[];
  subjects: OperatorBinding[];
  capabilities: Capability[];
  issuedToken: string;
  selectedSubject: string;
  selectedResource: string;
  selectedKind: "access" | "approval";
  scopeValue: string;
  ttlValue: string;
  placeholderColor: string;
  pending: boolean;
  onSelectSubject: (value: string) => void;
  onSelectResource: (value: string) => void;
  onSelectKind: (value: string) => void;
  onChangeScope: (value: string) => void;
  onChangeTtl: (value: string) => void;
  onIssue: () => void;
  onRevoke: (id: string) => void;
}) {
  const canIssue = subjects.length > 0 && resources.length > 0 && !pending;
  return (
    <View style={styles.card}>
      <CardHeader
        styles={styles}
        title={title}
        meta={`${count(capabilities.length, "capability", "capabilities")} issued · signed grants of one resource to one operator`}
      />
      {errorMessage ? <Text style={styles.danger}>{errorMessage}</Text> : null}

      <Text style={styles.sectionTitle}>issue</Text>
      <Text style={styles.fieldLabel}>subject</Text>
      <View style={styles.chipRow}>
        {subjects.map((operator) => (
          <SelectChip
            key={operator.id}
            styles={styles}
            label={operatorLabel(operator)}
            value={operator.id}
            selected={operator.id === selectedSubject}
            onSelect={onSelectSubject}
          />
        ))}
      </View>
      {subjects.length === 0 ? (
        <Text style={styles.muted}>
          Bind an active operator first; every capability needs a subject.
        </Text>
      ) : null}

      <Text style={styles.fieldLabel}>resource</Text>
      <View style={styles.chipRow}>
        {resources.map((resource) => (
          <SelectChip
            key={resource.id}
            styles={styles}
            label={resource.name}
            value={resource.id}
            selected={resource.id === selectedResource}
            onSelect={onSelectResource}
          />
        ))}
      </View>
      {resources.length === 0 ? (
        <Text style={styles.muted}>
          Add a resource to the project first; issuance only covers project members.
        </Text>
      ) : null}

      <Text style={styles.fieldLabel}>kind</Text>
      <View style={styles.chipRow}>
        <SelectChip
          styles={styles}
          label="access"
          value="access"
          selected={selectedKind === "access"}
          onSelect={onSelectKind}
        />
        <SelectChip
          styles={styles}
          label="approval"
          value="approval"
          selected={selectedKind === "approval"}
          onSelect={onSelectKind}
        />
      </View>

      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder='scope JSON, e.g. {"write":true}'
          placeholderTextColor={placeholderColor}
          value={scopeValue}
          onChangeText={onChangeScope}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="ttl seconds (optional)"
          placeholderTextColor={placeholderColor}
          value={ttlValue}
          onChangeText={onChangeTtl}
          keyboardType="numeric"
        />
      </View>
      <View style={styles.row}>
        <Pressable style={styles.primary} disabled={!canIssue} onPress={onIssue}>
          <Text style={styles.primaryText}>Issue capability</Text>
        </Pressable>
      </View>

      {issuedToken !== "" ? (
        <View style={styles.tokenBox}>
          <Text style={styles.fieldLabel}>issued token</Text>
          <Text style={styles.mono} selectable>
            {issuedToken}
          </Text>
          <Text style={styles.muted}>
            Injected as LINGUS_CAPABILITIES when the session of this operator opens next.
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>issued for this project</Text>
      {capabilities.map((capability) => (
        <CapabilityRow
          key={capability.id}
          styles={styles}
          capability={capability}
          resourceName={resourceLabel(capability.resourceId, resources)}
          pending={pending}
          onRevoke={onRevoke}
        />
      ))}
      {capabilities.length === 0 ? (
        <Text style={styles.empty}>No capabilities issued yet.</Text>
      ) : null}
    </View>
  );
}

/** Any token this registry issued can be checked here, project or not. */
export function VerifyPanel({
  styles,
  tokenValue,
  presenterValue,
  result,
  placeholderColor,
  pending,
  onChangeToken,
  onChangePresenter,
  onVerify,
}: {
  styles: Styles;
  tokenValue: string;
  presenterValue: string;
  result: CapabilityVerification | null;
  placeholderColor: string;
  pending: boolean;
  onChangeToken: (value: string) => void;
  onChangePresenter: (value: string) => void;
  onVerify: () => void;
}) {
  return (
    <View style={styles.card}>
      <CardHeader
        styles={styles}
        title="Verify a token"
        meta="signature, expiry, revocation and the expected presenter"
      />
      <TextInput
        style={styles.multiline}
        multiline
        placeholder="paste a capability token"
        placeholderTextColor={placeholderColor}
        value={tokenValue}
        onChangeText={onChangeToken}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="expected presenter (optional)"
        placeholderTextColor={placeholderColor}
        value={presenterValue}
        onChangeText={onChangePresenter}
        autoCapitalize="none"
      />
      <View style={styles.row}>
        <Pressable
          style={styles.primary}
          disabled={tokenValue.trim() === "" || pending}
          onPress={onVerify}
        >
          <Text style={styles.primaryText}>Verify</Text>
        </Pressable>
      </View>
      {result === null ? null : <VerificationResult styles={styles} result={result} />}
    </View>
  );
}

/** The verdict, with the claims that survived a refusal when there are any. */
function VerificationResult({
  styles,
  result,
}: {
  styles: Styles;
  result: CapabilityVerification;
}) {
  if (result.ok) {
    return (
      <View style={styles.tokenBox}>
        <Text style={styles.success}>ok</Text>
        <Text style={styles.mono}>{result.subject ?? "unknown subject"}</Text>
        <Text style={styles.mono}>{result.resourceId ?? "unknown resource"}</Text>
      </View>
    );
  }
  return (
    <View style={styles.tokenBox}>
      <Text style={styles.danger}>{result.reason ?? "refused"}</Text>
      <Text style={styles.mono}>{result.subject ?? "unknown subject"}</Text>
      <Text style={styles.mono}>{result.resourceId ?? "unknown resource"}</Text>
    </View>
  );
}

const EVENT_LABELS: Record<string, string> = {
  resource_registered: "Resource registered",
  resource_status: "Resource status changed",
  class_changed: "Resource reclassified",
  revocation: "Resource revoked",
  project_created: "Project created",
  project_renamed: "Project renamed",
  member_added: "Member added",
  member_removed: "Member removed",
  workspace_bound: "Workspace bound",
  workspace_unbound: "Workspace unbound",
  share_added: "Project shared",
  share_removed: "Share removed",
  operator_bound: "Operator bound",
  operator_status: "Operator status changed",
  session_indexed: "Session indexed",
  capability_issued: "Capability issued",
  capability_revoked: "Capability revoked",
  capability_denied: "Capability refused",
};

function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type;
}

/** Refusals and revocations are the events worth spotting from across the room. */
function eventDot(styles: Styles, type: string) {
  if (type === "capability_denied" || type === "capability_revoked" || type === "revocation") {
    return styles.dotDanger;
  }
  if (
    type.endsWith("_added") ||
    type.endsWith("_registered") ||
    type.endsWith("_bound") ||
    type === "capability_issued"
  ) {
    return styles.dotSuccess;
  }
  return styles.dotNeutral;
}

function EventRow({ styles, event }: { styles: Styles; event: RegistryEvent }) {
  const reason = typeof event.payload.reason === "string" ? ` · ${event.payload.reason}` : "";
  return (
    <View style={styles.listItem}>
      <View style={eventDot(styles, event.type)} />
      <View style={styles.grow}>
        <Text style={styles.itemTitle}>{eventLabel(event.type)}</Text>
        <Text style={styles.muted}>
          {formatTime(event.ts)} · {shortId(event.subject)}
          {reason}
        </Text>
      </View>
    </View>
  );
}

function broadcastTitle(entry: BroadcastEntry): string {
  switch (entry.type) {
    case "project":
      return entry.project.project.name;
    case "ai-capability":
      return entry.resource.name;
    case "revocation":
      return shortId(entry.resourceId);
  }
}

function broadcastDetail(entry: BroadcastEntry): string {
  switch (entry.type) {
    case "project":
      return `project · ${entry.project.members.length} members`;
    case "ai-capability":
      return `ai-capability · ${entry.resource.locality}`;
    case "revocation":
      return `revocation · ${entry.reason}`;
  }
}

function broadcastKey(entry: BroadcastEntry): string {
  switch (entry.type) {
    case "project":
      return `project:${entry.project.project.id}`;
    case "ai-capability":
      return `ai-capability:${entry.resource.id}`;
    case "revocation":
      return `revocation:${entry.resourceId}:${entry.eventSeq}`;
  }
}

function BroadcastRow({ styles, entry }: { styles: Styles; entry: BroadcastEntry }) {
  return (
    <View style={styles.listItem}>
      <View style={styles.grow}>
        <Text style={styles.itemTitle}>{broadcastTitle(entry)}</Text>
        <Text style={styles.muted}>{broadcastDetail(entry)}</Text>
      </View>
    </View>
  );
}

/**
 * The registry's own audit trail and outbox, which are also the two things an
 * operator debugging a refusal wants to see. Reads are cheap locally and the
 * card refreshes after every mutation, so there is no polling here.
 */
export function ActivityCard({
  styles,
  events,
  broadcasts,
  pending,
  onRefresh,
}: {
  styles: Styles;
  events: RegistryEvent[];
  broadcasts: BroadcastEntry[];
  pending: boolean;
  onRefresh: () => void;
}) {
  return (
    <View style={styles.card}>
      <CardHeader
        styles={styles}
        title="Activity"
        meta={`${count(events.length, "recent event")} · ${count(broadcasts.length, "broadcast")}`}
        actionLabel="refresh"
        actionDisabled={pending}
        onAction={onRefresh}
      />
      <Text style={styles.sectionTitle}>recent events</Text>
      {events.map((event) => (
        <EventRow key={event.seq} styles={styles} event={event} />
      ))}
      {events.length === 0 ? <Text style={styles.empty}>No events yet.</Text> : null}

      <Text style={styles.sectionTitle}>broadcasts</Text>
      {broadcasts.map((entry) => (
        <BroadcastRow key={broadcastKey(entry)} styles={styles} entry={entry} />
      ))}
      {broadcasts.length === 0 ? <Text style={styles.empty}>Nothing shared yet.</Text> : null}
    </View>
  );
}

function formatTime(ts: number): string {
  return `${new Date(ts).toISOString().slice(11, 19)}Z`;
}
