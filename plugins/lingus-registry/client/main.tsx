// The registry screen: resources, draft projects, their paseo workspace
// bindings, members and operators. One screen keeps the first version small; the
// selected project's detail renders inline.
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import {
  broadcastList,
  eventsList,
  operatorBind,
  operatorList,
  operatorSetStatus,
  projectAddMember,
  projectBindWorkspace,
  projectCreate,
  projectDescriptor,
  projectList,
  projectMembers,
  projectWorkspaces,
  providerList,
  providerModels,
  registryInfo,
  resourceList,
  resourceRegister,
  resourceSetClass,
} from "../shared/contracts.js";
import type { OperatorStatus } from "../shared/model.js";
import {
  ActivityCard,
  ErrorCard,
  HeaderCard,
  OperatorPanel,
  ProjectDetail,
  ProjectForm,
  ProjectRow,
  ResourceForm,
  ResourceRow,
} from "./components.js";
import { createStyles } from "./styles.js";

function firstError(...errors: unknown[]): Error | null {
  for (const error of errors) {
    if (error instanceof Error) return error;
  }
  return null;
}

export function Main({ theme, host }: PluginScreenProps) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();

  const [resourceName, setResourceName] = useState("");
  const [resourceKind, setResourceKind] = useState("service");
  const [projectName, setProjectName] = useState("");
  const [workspaceValue, setWorkspaceValue] = useState("");
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  // Operator creation: a provider + model for a new paseo agent session, or an
  // existing session id to bind (D-P4 back-fill).
  const [operatorProvider, setOperatorProvider] = useState("");
  const [operatorModel, setOperatorModel] = useState("");
  const [operatorRole, setOperatorRole] = useState("");
  const [operatorSession, setOperatorSession] = useState("");
  // Which bound workspace a new operator session lands in. Only meaningful when
  // the project has more than one; a single workspace needs no choice.
  const [operatorWorkspace, setOperatorWorkspace] = useState("");

  const infoRpc = useRpc(registryInfo);
  const listResourcesRpc = useRpc(resourceList);
  const listProjectsRpc = useRpc(projectList);
  const descriptorRpc = useRpc(projectDescriptor);
  const membersRpc = useRpc(projectMembers);
  const workspacesRpc = useRpc(projectWorkspaces);
  const listOperatorsRpc = useRpc(operatorList);
  const listProvidersRpc = useRpc(providerList);
  const listProviderModelsRpc = useRpc(providerModels);
  const registerResourceRpc = useRpc(resourceRegister);
  const setClassRpc = useRpc(resourceSetClass);
  const createProjectRpc = useRpc(projectCreate);
  const addMemberRpc = useRpc(projectAddMember);
  const bindWorkspaceRpc = useRpc(projectBindWorkspace);
  const bindOperatorRpc = useRpc(operatorBind);
  const setOperatorStatusRpc = useRpc(operatorSetStatus);
  const listEventsRpc = useRpc(eventsList);
  const listBroadcastsRpc = useRpc(broadcastList);

  const infoQuery = useQuery({ queryKey: ["lingus", "info"], queryFn: () => infoRpc({}) });
  const resourcesQuery = useQuery({
    queryKey: ["lingus", "resources"],
    queryFn: () => listResourcesRpc({ includeBuiltin: true }),
  });
  const projectsQuery = useQuery({
    queryKey: ["lingus", "projects"],
    queryFn: () => listProjectsRpc({}),
  });
  const descriptorQuery = useQuery({
    queryKey: ["lingus", "descriptor", selectedProject],
    queryFn: () => descriptorRpc({ projectId: selectedProject as string }),
    enabled: selectedProject !== null,
  });
  const membersQuery = useQuery({
    queryKey: ["lingus", "members", selectedProject],
    queryFn: () => membersRpc({ projectId: selectedProject as string }),
    enabled: selectedProject !== null,
  });
  const workspacesQuery = useQuery({
    queryKey: ["lingus", "workspaces", selectedProject],
    queryFn: () => workspacesRpc({ projectId: selectedProject as string }),
    enabled: selectedProject !== null,
  });
  const operatorsQuery = useQuery({
    queryKey: ["lingus", "operators", selectedProject],
    queryFn: () => listOperatorsRpc({ projectId: selectedProject as string }),
    enabled: selectedProject !== null,
  });
  const providersQuery = useQuery({
    queryKey: ["lingus", "providers"],
    queryFn: () => listProvidersRpc({}),
  });
  const modelsQuery = useQuery({
    queryKey: ["lingus", "models", operatorProvider],
    queryFn: () => listProviderModelsRpc({ provider: operatorProvider }),
    enabled: operatorProvider !== "",
  });
  // The registry's own audit trail and outbox. Both are small locally, so the
  // screen reads them whole and trims for display.
  const eventsQuery = useQuery({
    queryKey: ["lingus", "events"],
    queryFn: () => listEventsRpc({ since: 0 }),
  });
  const broadcastsQuery = useQuery({
    queryKey: ["lingus", "broadcasts"],
    queryFn: () => listBroadcastsRpc({ since: 0 }),
  });

  const providersData = providersQuery.data;
  const modelsData = modelsQuery.data;
  const providers = useMemo(() => providersData?.providers ?? [], [providersData]);
  const availableProviders = useMemo(
    () => providers.filter((provider) => provider.available),
    [providers],
  );
  const models = useMemo(() => modelsData?.models ?? [], [modelsData]);
  // Keep a valid model selected: switching provider drops a model it does not
  // offer, so fall back to that provider's default (or first) model.
  const activeModel = useMemo(() => {
    if (models.some((model) => model.id === operatorModel)) return operatorModel;
    const fallback = models.find((model) => model.isDefault) ?? models[0];
    return fallback?.id ?? "";
  }, [models, operatorModel]);

  const invalidateResources = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["lingus", "resources"] }),
    [queryClient],
  );
  const invalidateProjects = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["lingus", "projects"] }),
    [queryClient],
  );
  const invalidateDetail = useCallback(
    (projectId: string) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lingus", "descriptor", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["lingus", "members", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["lingus", "workspaces", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["lingus", "operators", projectId] }),
      ]),
    [queryClient],
  );
  // Every write appends an audit event, and some change the broadcast outbox, so
  // the activity card refreshes after any mutation rather than on a timer.
  const invalidateActivity = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lingus", "events"] }),
        queryClient.invalidateQueries({ queryKey: ["lingus", "broadcasts"] }),
      ]),
    [queryClient],
  );

  const registerMutation = useMutation({
    mutationFn: (input: { name: string; kind: string }) => registerResourceRpc(input),
    onSuccess: async () => {
      setResourceName("");
      await Promise.all([invalidateResources(), invalidateActivity()]);
    },
  });
  const setClassMutation = useMutation({
    mutationFn: (input: { id: string; class: "private" | "work" }) => setClassRpc(input),
    onSuccess: async () => {
      await Promise.all([invalidateResources(), invalidateActivity()]);
    },
  });
  const createProjectMutation = useMutation({
    mutationFn: (input: { name: string }) => createProjectRpc(input),
    onSuccess: async () => {
      setProjectName("");
      await Promise.all([invalidateProjects(), invalidateActivity()]);
    },
  });
  const addMemberMutation = useMutation({
    mutationFn: (input: { projectId: string; resourceId: string }) => addMemberRpc(input),
    onSuccess: async (_data, variables) => {
      await Promise.all([invalidateDetail(variables.projectId), invalidateActivity()]);
    },
  });
  const bindWorkspaceMutation = useMutation({
    mutationFn: (input: { projectId: string; workspaceId: string }) => bindWorkspaceRpc(input),
    onSuccess: async (_data, variables) => {
      setWorkspaceValue("");
      await Promise.all([invalidateDetail(variables.projectId), invalidateActivity()]);
    },
  });
  const bindOperatorMutation = useMutation({
    mutationFn: (input: {
      projectId: string;
      role?: string;
      provider?: string;
      title?: string;
      agentSessionId?: string;
      workspaceId?: string;
    }) => bindOperatorRpc(input),
    onSuccess: async (_data, variables) => {
      setOperatorRole("");
      setOperatorSession("");
      await Promise.all([invalidateDetail(variables.projectId), invalidateActivity()]);
    },
  });
  const setOperatorStatusMutation = useMutation({
    mutationFn: (input: { id: string; status: OperatorStatus }) => setOperatorStatusRpc(input),
    onSuccess: async () => {
      const detail = selectedProject ? invalidateDetail(selectedProject) : Promise.resolve();
      await Promise.all([detail, invalidateActivity()]);
    },
  });

  // `?? []` allocated inline would be a fresh array on every render, which both
  // defeats memoization and trips the react-perf array rule; memoize per query.
  const resourcesData = resourcesQuery.data;
  const projectsData = projectsQuery.data;
  const membersData = membersQuery.data;
  const workspacesData = workspacesQuery.data;
  const operatorsData = operatorsQuery.data;
  const eventsData = eventsQuery.data;
  const broadcastsData = broadcastsQuery.data;
  const resources = useMemo(() => resourcesData?.resources ?? [], [resourcesData]);
  const projects = useMemo(() => projectsData?.projects ?? [], [projectsData]);
  const members = useMemo(() => membersData?.members ?? [], [membersData]);
  const workspaces = useMemo(() => workspacesData?.workspaces ?? [], [workspacesData]);
  const operators = useMemo(() => operatorsData?.operators ?? [], [operatorsData]);
  // Newest first, and only the tail: the audit trail grows forever and the card
  // is a glance, not a log viewer.
  const recentEvents = useMemo(() => (eventsData?.events ?? []).slice(-12).reverse(), [eventsData]);
  const broadcasts = useMemo(() => broadcastsData?.entries ?? [], [broadcastsData]);
  const memberIds = useMemo(() => new Set(members.map((member) => member.resourceId)), [members]);
  const addableResources = useMemo(
    () => resources.filter((resource) => !resource.builtin && !memberIds.has(resource.id)),
    [memberIds, resources],
  );
  // A new operator session lands in one bound workspace. With a single binding
  // there is nothing to choose; with more, the server refuses to guess (D-P4), so
  // fall back to the first when the stored pick is stale.
  const activeWorkspace = useMemo(() => {
    if (workspaces.some((workspace) => workspace.workspaceId === operatorWorkspace)) {
      return operatorWorkspace;
    }
    return workspaces[0]?.workspaceId ?? "";
  }, [operatorWorkspace, workspaces]);

  const handleRegisterResource = useCallback(
    (name: string, kind: string) => registerMutation.mutate({ name, kind }),
    [registerMutation],
  );
  const handleToggleClass = useCallback(
    (id: string, next: "private" | "work") => setClassMutation.mutate({ id, class: next }),
    [setClassMutation],
  );
  const handleCreateProject = useCallback(
    (name: string) => createProjectMutation.mutate({ name }),
    [createProjectMutation],
  );
  const handleOpenProject = useCallback((id: string) => setSelectedProject(id), []);
  const handleBindWorkspace = useCallback(
    (workspaceId: string) => {
      if (selectedProject) {
        bindWorkspaceMutation.mutate({ projectId: selectedProject, workspaceId });
      }
    },
    [bindWorkspaceMutation, selectedProject],
  );
  const handleAddMember = useCallback(
    (resourceId: string) => {
      if (selectedProject) addMemberMutation.mutate({ projectId: selectedProject, resourceId });
    },
    [addMemberMutation, selectedProject],
  );
  const handleSelectProvider = useCallback((id: string) => setOperatorProvider(id), []);
  const handleSelectModel = useCallback((id: string) => setOperatorModel(id), []);
  const handleSelectOperatorWorkspace = useCallback(
    (workspaceId: string) => setOperatorWorkspace(workspaceId),
    [],
  );
  const handleChangeOperatorRole = useCallback((value: string) => setOperatorRole(value), []);
  const handleChangeOperatorSession = useCallback((value: string) => setOperatorSession(value), []);
  const handleCreateOperator = useCallback(() => {
    if (!selectedProject || operatorProvider === "" || activeModel === "") return;
    const role = operatorRole.trim();
    bindOperatorMutation.mutate({
      projectId: selectedProject,
      // Explicit rather than left to the server: with several bound workspaces
      // the server refuses to guess, and the picker already showed the choice.
      workspaceId: activeWorkspace === "" ? undefined : activeWorkspace,
      role: role === "" ? undefined : role,
      provider: `${operatorProvider}/${activeModel}`,
      title: role === "" ? undefined : role,
    });
  }, [
    activeModel,
    activeWorkspace,
    bindOperatorMutation,
    operatorProvider,
    operatorRole,
    selectedProject,
  ]);
  const handleBackfillOperator = useCallback(() => {
    const agentSessionId = operatorSession.trim();
    if (!selectedProject || agentSessionId === "") return;
    const role = operatorRole.trim();
    bindOperatorMutation.mutate({
      projectId: selectedProject,
      agentSessionId,
      role: role === "" ? undefined : role,
    });
  }, [bindOperatorMutation, operatorRole, operatorSession, selectedProject]);
  const handleToggleOperatorStatus = useCallback(
    (id: string, status: OperatorStatus) => setOperatorStatusMutation.mutate({ id, status }),
    [setOperatorStatusMutation],
  );
  const handleRefreshActivity = useCallback(() => {
    void invalidateActivity();
  }, [invalidateActivity]);

  const lastError = firstError(
    registerMutation.error,
    setClassMutation.error,
    createProjectMutation.error,
    addMemberMutation.error,
    bindWorkspaceMutation.error,
    descriptorQuery.error,
    eventsQuery.error,
    broadcastsQuery.error,
  );
  // Operator failures stay next to the operator form instead of the page-level
  // banner: a rejected provider or a mistyped session id belongs to that panel.
  const operatorError = firstError(
    bindOperatorMutation.error,
    setOperatorStatusMutation.error,
    providersQuery.error,
    modelsQuery.error,
  );
  const placeholderColor = theme.colors.foregroundMuted;
  const operatorPending = bindOperatorMutation.isPending || setOperatorStatusMutation.isPending;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <HeaderCard
        styles={styles}
        hostLabel={host.label}
        hostId={infoQuery.data?.hostId ?? "resolving…"}
        schemaVersion={infoQuery.data?.schemaVersion ?? 0}
        resourceCount={resources.length}
        projectCount={projects.length}
      />
      {lastError ? <ErrorCard styles={styles} message={lastError.message} /> : null}

      <View>
        <Text style={styles.sectionTitle}>Resources</Text>
        <View style={styles.card}>
          <ResourceForm
            styles={styles}
            name={resourceName}
            kind={resourceKind}
            placeholderColor={placeholderColor}
            pending={registerMutation.isPending}
            onChangeName={setResourceName}
            onChangeKind={setResourceKind}
            onSubmit={handleRegisterResource}
          />
          {resources.map((resource) => (
            <ResourceRow
              key={resource.id}
              styles={styles}
              resource={resource}
              pending={setClassMutation.isPending}
              onToggleClass={handleToggleClass}
            />
          ))}
          {resources.length === 0 ? <Text style={styles.muted}>No resources yet.</Text> : null}
        </View>
      </View>

      <View>
        <Text style={styles.sectionTitle}>Draft projects</Text>
        <View style={styles.card}>
          <ProjectForm
            styles={styles}
            name={projectName}
            placeholderColor={placeholderColor}
            pending={createProjectMutation.isPending}
            onChangeName={setProjectName}
            onSubmit={handleCreateProject}
          />
          {projects.map((project) => (
            <ProjectRow
              key={project.id}
              styles={styles}
              project={project}
              selected={selectedProject === project.id}
              onOpen={handleOpenProject}
            />
          ))}
          {projects.length === 0 ? <Text style={styles.muted}>No projects yet.</Text> : null}
        </View>
      </View>

      {selectedProject ? (
        <ProjectDetail
          styles={styles}
          title={descriptorQuery.data?.descriptor.project.name ?? selectedProject}
          memberCount={members.length}
          workspaceValue={workspaceValue}
          placeholderColor={placeholderColor}
          workspaces={workspaces}
          members={members}
          resources={resources}
          addable={addableResources}
          bindPending={bindWorkspaceMutation.isPending}
          addPending={addMemberMutation.isPending}
          onChangeWorkspace={setWorkspaceValue}
          onBindWorkspace={handleBindWorkspace}
          onAddMember={handleAddMember}
        />
      ) : null}

      {selectedProject ? (
        <OperatorPanel
          styles={styles}
          title={`Operators · ${descriptorQuery.data?.descriptor.project.name ?? selectedProject}`}
          errorMessage={operatorError ? operatorError.message : null}
          canBind={workspaces.length > 0}
          providers={availableProviders}
          models={models}
          modelsPending={modelsQuery.isLoading}
          workspaces={workspaces}
          selectedWorkspace={activeWorkspace}
          selectedProvider={operatorProvider}
          selectedModel={activeModel}
          roleValue={operatorRole}
          sessionValue={operatorSession}
          placeholderColor={placeholderColor}
          pending={operatorPending}
          operators={operators}
          onSelectProvider={handleSelectProvider}
          onSelectModel={handleSelectModel}
          onSelectWorkspace={handleSelectOperatorWorkspace}
          onChangeRole={handleChangeOperatorRole}
          onChangeSession={handleChangeOperatorSession}
          onCreate={handleCreateOperator}
          onBackfill={handleBackfillOperator}
          onToggleStatus={handleToggleOperatorStatus}
        />
      ) : null}

      <ActivityCard
        styles={styles}
        events={recentEvents}
        broadcasts={broadcasts}
        pending={eventsQuery.isFetching || broadcastsQuery.isFetching}
        onRefresh={handleRefreshActivity}
      />
    </ScrollView>
  );
}
