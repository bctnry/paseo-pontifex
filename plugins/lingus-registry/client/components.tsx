// Presentational pieces of the registry screen.
//
// react-perf rules require stable props: handlers arrive from the parent or are
// wrapped in `useCallback` here, and every style is a `styles` entry.
import { useCallback } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type {
  OperatorBinding,
  OperatorStatus,
  ProjectMember,
  ProjectWorkspace,
  ProviderInfo,
  ProviderModel,
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
    <View style={styles.card}>
      <Text style={styles.title}>Lingus registry</Text>
      <Text style={styles.muted}>
        host {hostLabel} · {hostId}
      </Text>
      <Text style={styles.muted}>
        schema v{schemaVersion} · {resourceCount} resources · {projectCount} projects
      </Text>
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

export function ResourceForm({
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

export function ResourceRow({
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
    <View style={styles.row}>
      <View style={styles.grow}>
        <Text style={styles.title}>{resource.name}</Text>
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

export function ProjectForm({
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

export function ProjectRow({
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
    <Pressable style={styles.row} onPress={handleOpen}>
      <View style={styles.grow}>
        <Text style={styles.title}>{project.name}</Text>
        <Text style={styles.muted}>{project.id}</Text>
      </View>
      <Chip styles={styles} label={selected ? "selected" : "open"} variant="neutral" />
    </Pressable>
  );
}

export function BindWorkspaceForm({
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

export function AddMemberChip({
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

function describeOperator(operator: OperatorBinding): string {
  const parts = [operator.id, operator.status];
  if (operator.role) parts.push(operator.role);
  return parts.join(" · ");
}

export function OperatorRow({
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
    <View style={styles.row}>
      <View style={styles.grow}>
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
  selectedProvider,
  selectedModel,
  roleValue,
  sessionValue,
  placeholderColor,
  pending,
  operators,
  onSelectProvider,
  onSelectModel,
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
  selectedProvider: string;
  selectedModel: string;
  roleValue: string;
  sessionValue: string;
  placeholderColor: string;
  pending: boolean;
  operators: OperatorBinding[];
  onSelectProvider: (value: string) => void;
  onSelectModel: (value: string) => void;
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
      <Text style={styles.title}>{title}</Text>
      {errorMessage ? <Text style={styles.danger}>{errorMessage}</Text> : null}

      <Text style={styles.sectionTitle}>new paseo agent session</Text>
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
          placeholder="role (optional)"
          placeholderTextColor={placeholderColor}
          value={roleValue}
          onChangeText={onChangeRole}
        />
        <Pressable style={styles.primary} disabled={!canCreate} onPress={onCreate}>
          <Text style={styles.primaryText}>Create operator</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>existing paseo agent session</Text>
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

      {operators.map((operator) => (
        <OperatorRow
          key={operator.id}
          styles={styles}
          operator={operator}
          pending={pending}
          onToggleStatus={onToggleStatus}
        />
      ))}
      {operators.length === 0 ? <Text style={styles.muted}>No operators yet.</Text> : null}
    </View>
  );
}

function describeWorkspace(workspace: ProjectWorkspace): string {
  return workspace.role ? `${workspace.workspaceId} · ${workspace.role}` : workspace.workspaceId;
}

function describeMember(member: ProjectMember, resources: Resource[]): string {
  const name = resources.find((resource) => resource.id === member.resourceId)?.name;
  return name ? `${name} (${member.resourceId})` : member.resourceId;
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
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.muted}>
        {memberCount} members · {workspaces.length} workspaces
      </Text>

      <Text style={styles.sectionTitle}>paseo workspaces</Text>
      {workspaces.map((workspace) => (
        <Text key={workspace.workspaceId} style={styles.muted}>
          {describeWorkspace(workspace)}
        </Text>
      ))}
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
        <Text key={member.resourceId} style={styles.muted}>
          {describeMember(member, resources)}
        </Text>
      ))}
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
