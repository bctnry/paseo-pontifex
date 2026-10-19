// The registry screen: resources, draft projects, their paseo workspace
// bindings, members and operators. One screen keeps the first version small; the
// selected project's detail renders inline.
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import {
  broadcastList,
  capabilityIssue,
  capabilityList,
  capabilityRevoke,
  capabilityVerify,
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
import type { TabItem } from "./components.js";
import {
  ActivityCard,
  CapabilityPanel,
  ErrorCard,
  HeaderCard,
  HintCard,
  OperatorPanel,
  ProjectDetail,
  ProjectsCard,
  ResourcesCard,
  TabBar,
  TabPane,
  VerifyPanel,
} from "./components.js";
import { createStyles } from "./styles.js";

function firstError(...errors: unknown[]): Error | null {
  for (const error of errors) {
    if (error instanceof Error) return error;
  }
  return null;
}

/**
 * Local validation wins over RPC errors: a rejected scope is the most recent
 * thing that happened, and a mutation error stays set until the next attempt.
 */
function capabilityMessage(capError: string | null, ...errors: unknown[]): string | null {
  if (capError !== null) return capError;
  return firstError(...errors)?.message ?? null;
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
  // Capability issuance for the selected project, plus a verifier that accepts
  // any token this registry issued (it does not need the project to be open).
  const [capSubject, setCapSubject] = useState("");
  const [capResource, setCapResource] = useState("");
  const [capKind, setCapKind] = useState<"access" | "approval">("access");
  const [capScope, setCapScope] = useState("{}");
  const [capTtl, setCapTtl] = useState("");
  const [capError, setCapError] = useState<string | null>(null);
  const [issuedToken, setIssuedToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [verifyPresenter, setVerifyPresenter] = useState("");
  // One tab at a time; the selected project survives tab switches.
  const [activeTab, setActiveTab] = useState("resources");

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
  const listCapabilitiesRpc = useRpc(capabilityList);
  const issueCapabilityRpc = useRpc(capabilityIssue);
  const revokeCapabilityRpc = useRpc(capabilityRevoke);
  const verifyCapabilityRpc = useRpc(capabilityVerify);

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
  const capabilitiesQuery = useQuery({
    queryKey: ["lingus", "capabilities", selectedProject],
    queryFn: () => listCapabilitiesRpc({ projectId: selectedProject as string }),
    enabled: selectedProject !== null,
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
        queryClient.invalidateQueries({ queryKey: ["lingus", "capabilities", projectId] }),
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
  const issueCapabilityMutation = useMutation({
    mutationFn: (input: {
      projectId: string;
      resourceId: string;
      subject: string;
      kind: "access" | "approval";
      scope: Record<string, unknown>;
      ttlSec?: number;
    }) => issueCapabilityRpc(input),
    onSuccess: async (data, variables) => {
      setIssuedToken(data.token);
      setCapError(null);
      await Promise.all([invalidateDetail(variables.projectId), invalidateActivity()]);
    },
  });
  const revokeCapabilityMutation = useMutation({
    mutationFn: (input: { id: string }) => revokeCapabilityRpc(input),
    onSuccess: async () => {
      const detail = selectedProject ? invalidateDetail(selectedProject) : Promise.resolve();
      await Promise.all([detail, invalidateActivity()]);
    },
  });
  const verifyCapabilityMutation = useMutation({
    mutationFn: (input: { token: string; presenter?: string }) => verifyCapabilityRpc(input),
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
  const capabilitiesData = capabilitiesQuery.data;
  const capabilities = useMemo(() => capabilitiesData?.capabilities ?? [], [capabilitiesData]);
  // Only an active operator can be a subject, and only a project member resource
  // can be a target; the pickers offer exactly what issuance will accept.
  const subjects = useMemo(
    () => operators.filter((operator) => operator.status === "active"),
    [operators],
  );
  const memberResources = useMemo(() => {
    const byId = new Map(resources.map((resource) => [resource.id, resource]));
    return members.flatMap((member) => {
      const resource = byId.get(member.resourceId);
      return resource ? [resource] : [];
    });
  }, [members, resources]);
  const activeSubject = useMemo(() => {
    if (subjects.some((operator) => operator.id === capSubject)) return capSubject;
    return subjects[0]?.id ?? "";
  }, [capSubject, subjects]);
  const activeCapResource = useMemo(() => {
    if (memberResources.some((resource) => resource.id === capResource)) return capResource;
    return memberResources[0]?.id ?? "";
  }, [capResource, memberResources]);
  const projectTitle = descriptorQuery.data?.descriptor.project.name ?? selectedProject ?? "";
  // Only the host-wide tabs carry counts: operators and capabilities are scoped
  // to the open project, and a "0" before one is open would read as "none exist".
  const tabs = useMemo<TabItem[]>(
    () => [
      { id: "resources", label: "Resources", count: resources.length },
      { id: "projects", label: "Projects", count: projects.length },
      { id: "operators", label: "Operators" },
      { id: "capabilities", label: "Capabilities" },
      { id: "activity", label: "Activity" },
    ],
    [projects.length, resources.length],
  );

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
  const handleSelectTab = useCallback((id: string) => setActiveTab(id), []);
  const handleSelectCapabilitySubject = useCallback((id: string) => setCapSubject(id), []);
  const handleSelectCapabilityResource = useCallback((id: string) => setCapResource(id), []);
  const handleSelectCapabilityKind = useCallback((value: string) => {
    if (value === "access" || value === "approval") setCapKind(value);
  }, []);
  const handleChangeCapabilityScope = useCallback((value: string) => setCapScope(value), []);
  const handleChangeCapabilityTtl = useCallback((value: string) => setCapTtl(value), []);
  const handleChangeVerifyToken = useCallback((value: string) => setVerifyToken(value), []);
  const handleChangeVerifyPresenter = useCallback((value: string) => setVerifyPresenter(value), []);
  const handleIssueCapability = useCallback(() => {
    if (!selectedProject || activeSubject === "" || activeCapResource === "") return;
    // The server validates scope against the member's allocation; parsing here
    // only turns "not JSON" into a message next to the form instead of an RPC
    // round trip.
    let scope: Record<string, unknown> = {};
    const scopeRaw = capScope.trim();
    if (scopeRaw !== "") {
      try {
        const parsed: unknown = JSON.parse(scopeRaw);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          setCapError("scope must be a JSON object");
          return;
        }
        scope = parsed as Record<string, unknown>;
      } catch {
        setCapError("scope is not valid JSON");
        return;
      }
    }
    let ttlSec: number | undefined;
    const ttlRaw = capTtl.trim();
    if (ttlRaw !== "") {
      const parsed = Number(ttlRaw);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        setCapError("ttl must be a positive whole number of seconds");
        return;
      }
      ttlSec = parsed;
    }
    setCapError(null);
    issueCapabilityMutation.mutate({
      projectId: selectedProject,
      resourceId: activeCapResource,
      subject: activeSubject,
      kind: capKind,
      scope,
      ttlSec,
    });
  }, [
    activeCapResource,
    activeSubject,
    capKind,
    capScope,
    capTtl,
    issueCapabilityMutation,
    selectedProject,
  ]);
  const handleRevokeCapability = useCallback(
    (id: string) => revokeCapabilityMutation.mutate({ id }),
    [revokeCapabilityMutation],
  );
  const handleVerifyToken = useCallback(() => {
    const token = verifyToken.trim();
    if (token === "") return;
    const presenter = verifyPresenter.trim();
    verifyCapabilityMutation.mutate({
      token,
      presenter: presenter === "" ? undefined : presenter,
    });
  }, [verifyCapabilityMutation, verifyPresenter, verifyToken]);

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
  const capabilityError = capabilityMessage(
    capError,
    issueCapabilityMutation.error,
    revokeCapabilityMutation.error,
    capabilitiesQuery.error,
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

      <TabBar styles={styles} tabs={tabs} activeTab={activeTab} onSelect={handleSelectTab} />

      <TabPane active={activeTab} id="resources">
        <View style={styles.narrow}>
          <ResourcesCard
            styles={styles}
            resources={resources}
            name={resourceName}
            kind={resourceKind}
            placeholderColor={placeholderColor}
            pending={registerMutation.isPending || setClassMutation.isPending}
            onChangeName={setResourceName}
            onChangeKind={setResourceKind}
            onCreate={handleRegisterResource}
            onToggleClass={handleToggleClass}
          />
        </View>
      </TabPane>

      <TabPane active={activeTab} id="projects">
        <View style={styles.grid}>
          <View style={styles.cell}>
            <ProjectsCard
              styles={styles}
              projects={projects}
              name={projectName}
              selectedProjectId={selectedProject}
              placeholderColor={placeholderColor}
              pending={createProjectMutation.isPending}
              onChangeName={setProjectName}
              onCreate={handleCreateProject}
              onOpen={handleOpenProject}
            />
          </View>
          <View style={styles.cell}>
            {selectedProject ? (
              <ProjectDetail
                styles={styles}
                title={projectTitle}
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
            ) : (
              <HintCard
                styles={styles}
                message="Open a project to see the workspaces and members it carries."
              />
            )}
          </View>
        </View>
      </TabPane>

      <TabPane active={activeTab} id="operators">
        <View style={styles.narrow}>
          {selectedProject ? (
            <OperatorPanel
              styles={styles}
              title={`Operators · ${projectTitle}`}
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
          ) : (
            <HintCard styles={styles} message="Open a project first: an operator belongs to one." />
          )}
        </View>
      </TabPane>

      <TabPane active={activeTab} id="capabilities">
        <View style={styles.grid}>
          <View style={styles.cell}>
            {selectedProject ? (
              <CapabilityPanel
                styles={styles}
                title={`Capabilities · ${projectTitle}`}
                errorMessage={capabilityError}
                resources={memberResources}
                subjects={subjects}
                capabilities={capabilities}
                issuedToken={issuedToken}
                selectedSubject={activeSubject}
                selectedResource={activeCapResource}
                selectedKind={capKind}
                scopeValue={capScope}
                ttlValue={capTtl}
                placeholderColor={placeholderColor}
                pending={issueCapabilityMutation.isPending || revokeCapabilityMutation.isPending}
                onSelectSubject={handleSelectCapabilitySubject}
                onSelectResource={handleSelectCapabilityResource}
                onSelectKind={handleSelectCapabilityKind}
                onChangeScope={handleChangeCapabilityScope}
                onChangeTtl={handleChangeCapabilityTtl}
                onIssue={handleIssueCapability}
                onRevoke={handleRevokeCapability}
              />
            ) : (
              <HintCard
                styles={styles}
                message="Open a project to issue a capability; verification works on any token."
              />
            )}
          </View>
          <View style={styles.cell}>
            <VerifyPanel
              styles={styles}
              tokenValue={verifyToken}
              presenterValue={verifyPresenter}
              result={verifyCapabilityMutation.data?.verification ?? null}
              placeholderColor={placeholderColor}
              pending={verifyCapabilityMutation.isPending}
              onChangeToken={handleChangeVerifyToken}
              onChangePresenter={handleChangeVerifyPresenter}
              onVerify={handleVerifyToken}
            />
          </View>
        </View>
      </TabPane>

      <TabPane active={activeTab} id="activity">
        <ActivityCard
          styles={styles}
          events={recentEvents}
          broadcasts={broadcasts}
          pending={eventsQuery.isFetching || broadcastsQuery.isFetching}
          onRefresh={handleRefreshActivity}
        />
      </TabPane>
    </ScrollView>
  );
}
