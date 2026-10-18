// Server entry: opens the registry database in the plugin's data directory,
// bootstraps the built-in registry resource, and exposes the RPC surface.
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PluginHandlerContext, PluginServerContext } from "@getpaseo/plugin/server";
import {
  broadcastList,
  capabilityGet,
  capabilityIssue,
  capabilityList,
  capabilityRevoke,
  capabilityVerify,
  eventsList,
  operatorBind,
  operatorGet,
  operatorList,
  operatorSetStatus,
  projectAddMember,
  projectBindWorkspace,
  projectCreate,
  projectDescriptor,
  projectGet,
  projectList,
  projectMembers,
  projectRemoveMember,
  projectRename,
  projectUnbindWorkspace,
  projectWorkspaces,
  providerList,
  providerModels,
  registryInfo,
  resourceGet,
  resourceList,
  resourceRegister,
  resourceSetClass,
  resourceUpdate,
  sessionList,
  sessionRef,
  shareAdd,
  shareList,
  shareRemove,
} from "./shared/contracts.js";
import { loadOrCreateIssuerKeys } from "./server/capability.js";
import { openRegistryDatabase } from "./server/db.js";
import { Registry } from "./server/registry.js";

type Paseo = PluginHandlerContext["paseo"];

/**
 * Reads an agent session's own facts back from the daemon. D-P4 creates the
 * operator's session through `{paseo}.agents`, so the registry records what the
 * daemon reports (provider, workspace, title) rather than what the caller asked
 * for; a back-filled session is verified by the same read.
 */
async function readSessionFacts(paseo: Paseo, agentSessionId: string) {
  const snapshot = await paseo.agents.ref(agentSessionId).refresh();
  if (!snapshot) throw new Error(`no such paseo agent session: ${agentSessionId}`);
  return {
    agentSessionId: snapshot.agent.id,
    provider: snapshot.agent.provider,
    label: snapshot.agent.title ?? undefined,
    workspaceId: snapshot.agent.workspaceId,
  };
}

/**
 * Resolves this daemon's identity. The host passes its server id directly; the
 * env and file fallbacks keep fully-qualified ids stable across restarts for a
 * host that did not provide one, without inferring `$PASEO_HOME` from the shape
 * of the data directory.
 */
function resolveHostId(server: PluginServerContext, dataDirectory: string): string {
  if (server.serverId) return server.serverId;

  const override = process.env.PASEO_SERVER_ID?.trim();
  if (override) return override;

  const fallbackPath = path.join(dataDirectory, "host-id");
  try {
    const raw = readFileSync(fallbackPath, "utf8").trim();
    if (raw.length > 0) return raw;
  } catch {
    // First run: mint one below.
  }
  const generated = `local_${randomBytes(9).toString("base64url")}`;
  try {
    writeFileSync(fallbackPath, `${generated}\n`, { mode: 0o600 });
  } catch {
    // An unwritable directory still works; the id is just not persisted.
  }
  return generated;
}

export default function contribute(server: PluginServerContext) {
  const dataDirectory = server.dataDirectory;
  if (!dataDirectory) {
    throw new Error("lingus-registry requires server.dataDirectory to store its database");
  }

  const hostId = resolveHostId(server, dataDirectory);
  const registry = new Registry(
    openRegistryDatabase(path.join(dataDirectory, "registry.db")),
    hostId,
    loadOrCreateIssuerKeys(dataDirectory),
  );
  registry.bootstrap();

  server.handle(registryInfo, () => ({
    hostId,
    schemaVersion: registry.schemaVersion(),
    builtinResourceId: registry.builtinResourceId(),
    dataDirectory,
  }));

  server.handle(resourceRegister, (input) => ({ resource: registry.registerResource(input) }));
  server.handle(resourceGet, (input) => ({ resource: registry.getResource(input.id) }));
  server.handle(resourceList, (input) => ({ resources: registry.listResources(input) }));
  server.handle(resourceUpdate, (input) => ({
    resource: registry.updateResource(input.id, input),
  }));
  server.handle(resourceSetClass, (input) => ({
    resource: registry.setClass(input.id, input.class),
  }));

  server.handle(projectCreate, (input) => ({
    project: registry.createProject(input.name, input.owner),
  }));
  server.handle(projectGet, (input) => ({ project: registry.getProject(input.id) }));
  server.handle(projectList, () => ({ projects: registry.listProjects() }));
  server.handle(projectRename, (input) => ({
    project: registry.renameProject(input.id, input.name),
  }));
  server.handle(projectAddMember, (input) => ({
    members: registry.addMember(input.projectId, input.resourceId, input.allocation),
  }));
  server.handle(projectRemoveMember, (input) => ({
    members: registry.removeMember(input.projectId, input.resourceId),
  }));
  server.handle(projectMembers, (input) => ({ members: registry.listMembers(input.projectId) }));
  server.handle(projectBindWorkspace, (input) => ({
    workspaces: registry.bindWorkspace(
      input.projectId,
      input.workspaceId,
      input.daemonId,
      input.role,
    ),
  }));
  server.handle(projectUnbindWorkspace, (input) => ({
    workspaces: registry.unbindWorkspace(input.projectId, input.workspaceId),
  }));
  server.handle(projectWorkspaces, (input) => ({
    workspaces: registry.listWorkspaces(input.projectId),
  }));
  server.handle(projectDescriptor, (input) => ({
    descriptor: registry.descriptor(input.projectId),
  }));

  server.handle(shareAdd, (input) => ({
    shares: registry.addShare(input.projectId, input.peer, input.role),
  }));
  server.handle(shareRemove, (input) => ({
    shares: registry.removeShare(input.projectId, input.peer),
  }));
  server.handle(shareList, (input) => ({ shares: registry.listShares(input.projectId) }));

  server.handle(providerList, async (_input, { paseo }) => {
    const result = await paseo.providers.listAvailable();
    return {
      providers: result.providers.map((entry) => ({
        id: entry.provider,
        available: entry.available,
        error: entry.error ?? null,
      })),
    };
  });

  server.handle(providerModels, async (input, { paseo }) => {
    const result = await paseo.providers.listModels(input.provider);
    return {
      // Mirror the app's model catalog: a provider may report models that cannot
      // start a new session.
      models: (result.models ?? [])
        .filter((model) => model.isSelectable !== false)
        .map((model) => ({
          id: model.id,
          label: model.label,
          isDefault: model.isDefault === true,
        })),
    };
  });

  server.handle(operatorBind, async (input, { paseo }) => {
    const workspaceId = registry.resolveOperatorWorkspace(input.projectId, input.workspaceId);

    if (input.agentSessionId) {
      // Back-fill: bind an existing paseo session and create nothing.
      const facts = await readSessionFacts(paseo, input.agentSessionId);
      return {
        operator: registry.bindOperator({
          projectId: input.projectId,
          role: input.role,
          agentSessionId: facts.agentSessionId,
          workspaceId: facts.workspaceId ?? workspaceId,
          provider: facts.provider,
          label: facts.label,
          created: false,
        }),
        created: false,
      };
    }

    if (!input.provider) {
      throw new Error(
        "provider is required to create an operator session; pass agentSessionId to bind an existing one",
      );
    }
    const created = await paseo.workspaces.ref(workspaceId).agents.create({
      config: { provider: input.provider },
      title: input.title,
    });
    const facts = await readSessionFacts(paseo, created.id);
    return {
      operator: registry.bindOperator({
        projectId: input.projectId,
        role: input.role,
        agentSessionId: facts.agentSessionId,
        workspaceId: facts.workspaceId ?? workspaceId,
        provider: facts.provider,
        label: input.title ?? facts.label,
        created: true,
      }),
      created: true,
    };
  });
  server.handle(operatorGet, (input) => ({ operator: registry.getOperator(input.id) }));
  server.handle(operatorList, (input) => ({ operators: registry.listOperators(input.projectId) }));
  server.handle(operatorSetStatus, (input) => ({
    operator: registry.setOperatorStatus(input.id, input.status),
  }));

  server.handle(sessionRef, (input) => ({ session: registry.indexSession(input) }));
  server.handle(sessionList, () => ({ sessions: registry.listSessions() }));

  server.handle(capabilityIssue, (input) => registry.issueCapability(input));
  server.handle(capabilityGet, (input) => ({ capability: registry.getCapability(input.id) }));
  server.handle(capabilityList, (input) => ({
    capabilities: registry.listCapabilities(input),
  }));
  server.handle(capabilityRevoke, (input) => ({
    capability: registry.revokeCapability(input.id),
  }));
  server.handle(capabilityVerify, (input) => ({
    verification: registry.verifyCapability(input.token, input),
  }));

  server.handle(broadcastList, (input) => ({ entries: registry.broadcast(input.since ?? 0) }));
  server.handle(eventsList, (input) => ({
    events: registry.listEvents(input.since ?? 0, input.limit ?? 0),
  }));

  // --- capability injection -------------------------------------------------

  /**
   * Hands an operator its live capabilities as environment variables when its
   * session opens (draft 3.9, local half). Two rules keep this from becoming a
   * source of outages:
   *   - A `history` session replays a transcript and runs no tools, so it gets
   *     nothing (D-B-3).
   *   - Anything unexpected is logged and passed through. A before-hook that
   *     throws fails the whole session open, and a registry bug must not be able
   *     to stop agents from starting.
   */
  server.before("agent.session_open", ({ request }) => {
    try {
      if (request.purpose === "history") return request;
      const binding = registry.findActiveOperatorByAgent(request.agentId);
      if (!binding) return request;
      return {
        ...request,
        env: {
          ...request.env,
          LINGUS_DESCRIPTOR: JSON.stringify(registry.descriptor(binding.projectId)),
          LINGUS_CAPABILITIES: JSON.stringify(registry.tokensForBinding(binding.id)),
        },
      };
    } catch (error) {
      console.error("lingus-registry could not inject capabilities", error);
      return request;
    }
  });

  /**
   * Archiving a paseo session is the end of that operator: its bindings become
   * terminated and their capabilities join the revocation list.
   *
   * `agent.closed` deliberately does nothing here. It also fires on daemon
   * shutdown and when a runtime is replaced, and bindings must survive those
   * (D-B-2: the operator id is stable across session rebuilds).
   */
  server.on("agent.archived", (event) => {
    try {
      registry.terminateForAgent(event.agent.id);
    } catch (error) {
      console.error("lingus-registry could not terminate operator bindings", error);
    }
  });

  return () => {
    registry.close();
  };
}
