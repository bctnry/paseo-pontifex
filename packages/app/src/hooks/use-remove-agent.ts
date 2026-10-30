import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { agentHistoryQueryKey, allAgentHistoryQueryRootKey } from "@/hooks/agent-history-query-key";
import { removeAgentFromCachedLists } from "@/hooks/use-archive-agent";

export interface RemoveAgentInput {
  serverId: string;
  agentId: string;
}

/**
 * Permanent deletion, unlike archive. The daemon removes the agent from its registry;
 * here the agent is removed from the live directory immediately and restored only when
 * the request fails.
 */
export function useRemoveAgent() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const mutation = useMutation({
    mutationFn: async (input: RemoveAgentInput): Promise<void> => {
      const client = useSessionStore.getState().sessions[input.serverId]?.client ?? null;
      if (!client) {
        throw new Error(t("common.errors.daemonClientUnavailable"));
      }
      await client.deleteAgent(input.agentId);
    },
    onMutate: (input) => {
      const agent = useSessionStore.getState().sessions[input.serverId]?.agents.get(input.agentId);
      getHostRuntimeStore().restoreAgentSnapshot(input.serverId, input.agentId, undefined);
      removeAgentFromCachedLists(queryClient, input);
      return { agent };
    },
    onError: (_error, input, context) => {
      getHostRuntimeStore().restoreAgentSnapshot(input.serverId, input.agentId, context?.agent);
    },
    onSettled: (_result, _error, input) => {
      void queryClient.invalidateQueries({ queryKey: ["sidebarAgentsList", input.serverId] });
      void queryClient.invalidateQueries({ queryKey: ["allAgents", input.serverId] });
      void queryClient.invalidateQueries({ queryKey: agentHistoryQueryKey(input.serverId) });
      void queryClient.invalidateQueries({ queryKey: allAgentHistoryQueryRootKey() });
    },
  });

  const removeAgent = useCallback(
    async (input: RemoveAgentInput): Promise<void> => {
      await mutation.mutateAsync(input);
    },
    [mutation],
  );

  return { removeAgent };
}
