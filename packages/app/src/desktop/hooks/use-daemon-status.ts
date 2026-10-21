import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  getDesktopDaemonLogs,
  getDesktopDaemonStatus,
  shouldUseDesktopDaemon,
  type DesktopDaemonLogs,
  type DesktopDaemonStatus,
} from "@/desktop/daemon/desktop-daemon";
import { useDesktopIpcQueryErrorToast } from "@/desktop/hooks/desktop-ipc-error";

const DAEMON_STATUS_QUERY_KEY = ["desktopDaemonStatus"] as const;
const DAEMON_LOGS_QUERY_KEY = ["desktopDaemonLogs"] as const;

interface DaemonStatusData {
  status: DesktopDaemonStatus;
  logs: DesktopDaemonLogs | null;
}

export function useDaemonStatus() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const enabled = shouldUseDesktopDaemon();

  const query = useQuery<DesktopDaemonStatus, Error>({
    queryKey: DAEMON_STATUS_QUERY_KEY,
    enabled,
    staleTime: 30_000,
    refetchOnMount: "always",
    retry: false,
    queryFn: getDesktopDaemonStatus,
  });
  const logsQuery = useQuery<DesktopDaemonLogs, Error>({
    queryKey: DAEMON_LOGS_QUERY_KEY,
    enabled,
    staleTime: 30_000,
    refetchOnMount: false,
    retry: false,
    queryFn: getDesktopDaemonLogs,
  });
  const data = useMemo<DaemonStatusData | null>(
    () =>
      query.data
        ? {
            status: query.data,
            logs: logsQuery.data ?? null,
          }
        : null,
    [logsQuery.data, query.data],
  );
  useDesktopIpcQueryErrorToast({
    error: query.error,
    message: t("desktop.daemon.loadFailed"),
    logLabel: "[DesktopDaemon] Failed to load daemon status",
  });

  const setStatus = useCallback(
    (status: DesktopDaemonStatus) => {
      queryClient.setQueryData<DesktopDaemonStatus>(DAEMON_STATUS_QUERY_KEY, status);
    },
    [queryClient],
  );

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: DAEMON_STATUS_QUERY_KEY });
  }, [queryClient]);

  return {
    data,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    setStatus,
    refetch,
  };
}
