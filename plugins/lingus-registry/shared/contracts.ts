// Plugin RPC contracts shared by the client surfaces and the server subprocess.
//
// Inputs and outputs are validated on both sides. Method names are lowercase
// and dotted, grouped by the registry noun they act on.
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import {
  BroadcastEntrySchema,
  ClassSchema,
  DescriptorSchema,
  JsonObjectSchema,
  LocalitySchema,
  OperatorBindingSchema,
  OperatorStatusSchema,
  ProjectMemberSchema,
  ProjectShareSchema,
  ProjectWorkspaceSchema,
  ProviderInfoSchema,
  ProviderModelSchema,
  RegistryEventSchema,
  RegistryProjectSchema,
  ResourceSchema,
  ResourceStatusSchema,
  SessionRefSchema,
} from "./model.js";

export const registryInfo = defineRpc({
  name: "registry.info",
  input: z.object({}),
  output: z.object({
    hostId: z.string(),
    schemaVersion: z.number(),
    builtinResourceId: z.string(),
    dataDirectory: z.string(),
  }),
});

// --- resources -------------------------------------------------------------

export const resourceRegister = defineRpc({
  name: "resource.register",
  input: z.object({
    name: z.string().min(1),
    kind: z.string().min(1),
    locality: LocalitySchema.optional(),
    class: ClassSchema.optional(),
    attrs: JsonObjectSchema.optional(),
    provenance: JsonObjectSchema.optional(),
  }),
  output: z.object({ resource: ResourceSchema }),
});

export const resourceGet = defineRpc({
  name: "resource.get",
  input: z.object({ id: z.string().min(1) }),
  output: z.object({ resource: ResourceSchema }),
});

export const resourceList = defineRpc({
  name: "resource.list",
  input: z.object({
    class: ClassSchema.optional(),
    locality: LocalitySchema.optional(),
    kind: z.string().min(1).optional(),
    includeBuiltin: z.boolean().optional(),
  }),
  output: z.object({ resources: z.array(ResourceSchema) }),
});

export const resourceUpdate = defineRpc({
  name: "resource.update",
  input: z.object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    attrs: JsonObjectSchema.optional(),
    status: ResourceStatusSchema.optional(),
  }),
  output: z.object({ resource: ResourceSchema }),
});

export const resourceSetClass = defineRpc({
  name: "resource.set_class",
  input: z.object({ id: z.string().min(1), class: ClassSchema }),
  output: z.object({ resource: ResourceSchema }),
});

// --- projects --------------------------------------------------------------

export const projectCreate = defineRpc({
  name: "project.create",
  input: z.object({ name: z.string().min(1), owner: z.string().min(1).optional() }),
  output: z.object({ project: RegistryProjectSchema }),
});

export const projectGet = defineRpc({
  name: "project.get",
  input: z.object({ id: z.string().min(1) }),
  output: z.object({ project: RegistryProjectSchema }),
});

export const projectList = defineRpc({
  name: "project.list",
  input: z.object({}),
  output: z.object({ projects: z.array(RegistryProjectSchema) }),
});

export const projectRename = defineRpc({
  name: "project.rename",
  input: z.object({ id: z.string().min(1), name: z.string().min(1) }),
  output: z.object({ project: RegistryProjectSchema }),
});

export const projectAddMember = defineRpc({
  name: "project.add_member",
  input: z.object({
    projectId: z.string().min(1),
    resourceId: z.string().min(1),
    allocation: JsonObjectSchema.optional(),
  }),
  output: z.object({ members: z.array(ProjectMemberSchema) }),
});

export const projectRemoveMember = defineRpc({
  name: "project.remove_member",
  input: z.object({ projectId: z.string().min(1), resourceId: z.string().min(1) }),
  output: z.object({ members: z.array(ProjectMemberSchema) }),
});

export const projectMembers = defineRpc({
  name: "project.members",
  input: z.object({ projectId: z.string().min(1) }),
  output: z.object({ members: z.array(ProjectMemberSchema) }),
});

export const projectBindWorkspace = defineRpc({
  name: "project.bind_workspace",
  input: z.object({
    projectId: z.string().min(1),
    workspaceId: z.string().min(1),
    daemonId: z.string().optional(),
    role: z.string().min(1).optional(),
  }),
  output: z.object({ workspaces: z.array(ProjectWorkspaceSchema) }),
});

export const projectUnbindWorkspace = defineRpc({
  name: "project.unbind_workspace",
  input: z.object({ projectId: z.string().min(1), workspaceId: z.string().min(1) }),
  output: z.object({ workspaces: z.array(ProjectWorkspaceSchema) }),
});

export const projectWorkspaces = defineRpc({
  name: "project.workspaces",
  input: z.object({ projectId: z.string().min(1) }),
  output: z.object({ workspaces: z.array(ProjectWorkspaceSchema) }),
});

export const projectDescriptor = defineRpc({
  name: "project.descriptor",
  input: z.object({ projectId: z.string().min(1) }),
  output: z.object({ descriptor: DescriptorSchema }),
});

// --- shares ----------------------------------------------------------------

export const shareAdd = defineRpc({
  name: "share.add",
  input: z.object({
    projectId: z.string().min(1),
    peer: z.string().min(1),
    role: z.string(),
  }),
  output: z.object({ shares: z.array(ProjectShareSchema) }),
});

export const shareRemove = defineRpc({
  name: "share.remove",
  input: z.object({ projectId: z.string().min(1), peer: z.string().min(1) }),
  output: z.object({ shares: z.array(ProjectShareSchema) }),
});

export const shareList = defineRpc({
  name: "share.list",
  input: z.object({ projectId: z.string().min(1) }),
  output: z.object({ shares: z.array(ProjectShareSchema) }),
});

// --- operators and sessions ------------------------------------------------

/** paseo providers an operator session can be created with (D-P4). */
export const providerList = defineRpc({
  name: "provider.list",
  input: z.object({}),
  output: z.object({ providers: z.array(ProviderInfoSchema) }),
});

export const providerModels = defineRpc({
  name: "provider.models",
  input: z.object({ provider: z.string().min(1) }),
  output: z.object({ models: z.array(ProviderModelSchema) }),
});

export const operatorBind = defineRpc({
  name: "operator.bind",
  input: z.object({
    projectId: z.string().min(1),
    role: z.string().min(1).optional(),
    /**
     * Back-fill: bind this existing paseo agent session instead of creating one.
     * The plugin still verifies it against the daemon.
     */
    agentSessionId: z.string().min(1).optional(),
    /** Bound paseo workspace to create the session in; resolved when the project has one. */
    workspaceId: z.string().min(1).optional(),
    /** `provider/model`; required when creating a session (no `agentSessionId`). */
    provider: z.string().min(1).optional(),
    /** Title for a newly created agent session. */
    title: z.string().min(1).optional(),
  }),
  output: z.object({ operator: OperatorBindingSchema, created: z.boolean() }),
});

export const operatorGet = defineRpc({
  name: "operator.get",
  input: z.object({ id: z.string().min(1) }),
  output: z.object({ operator: OperatorBindingSchema }),
});

export const operatorList = defineRpc({
  name: "operator.list",
  input: z.object({ projectId: z.string().min(1).optional() }),
  output: z.object({ operators: z.array(OperatorBindingSchema) }),
});

export const operatorSetStatus = defineRpc({
  name: "operator.set_status",
  input: z.object({ id: z.string().min(1), status: OperatorStatusSchema }),
  output: z.object({ operator: OperatorBindingSchema }),
});

export const sessionRef = defineRpc({
  name: "session.ref",
  input: z.object({
    agentSessionId: z.string().min(1),
    daemonId: z.string().optional(),
    provider: z.string().min(1).optional(),
    label: z.string().min(1).optional(),
  }),
  output: z.object({ session: SessionRefSchema }),
});

export const sessionList = defineRpc({
  name: "session.list",
  input: z.object({}),
  output: z.object({ sessions: z.array(SessionRefSchema) }),
});

// --- projection and audit --------------------------------------------------

export const broadcastList = defineRpc({
  name: "broadcast.list",
  input: z.object({ since: z.number().optional() }),
  output: z.object({ entries: z.array(BroadcastEntrySchema) }),
});

export const eventsList = defineRpc({
  name: "events.list",
  input: z.object({ since: z.number().optional(), limit: z.number().optional() }),
  output: z.object({ events: z.array(RegistryEventSchema) }),
});
