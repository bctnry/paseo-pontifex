import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useQueryClient } from "@tanstack/react-query";
import type { MutableDaemonConfig, MutableDaemonConfigPatch } from "@getpaseo/protocol/messages";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { SettingsCard, SettingsRow } from "@/components/settings";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { useIsCompactFormFactor } from "@/constants/layout";
import { daemonPairingOfferQueryKey } from "@/data/daemon-pairing";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

const OFFICIAL_RELAY_ENDPOINT = "relay.paseo.sh:443";
const OFFICIAL_APP_BASE_URL = "https://app.paseo.sh";

type RelayMode = "official" | "custom";

interface RelayDraft {
  mode: RelayMode;
  endpoint: string;
  publicEndpoint: string;
  useTls: boolean;
  publicUseTls: boolean;
  appBaseUrl: string;
}

function isOfficialRelay(config: MutableDaemonConfig | null): boolean {
  const relay = config?.relay;
  return !relay?.endpoint || relay.endpoint === OFFICIAL_RELAY_ENDPOINT;
}

function initialDraft(config: MutableDaemonConfig): RelayDraft {
  const relay = config.relay;
  const endpoint = relay?.endpoint ?? OFFICIAL_RELAY_ENDPOINT;
  return {
    mode: isOfficialRelay(config) ? "official" : "custom",
    endpoint,
    publicEndpoint: relay?.publicEndpoint ?? endpoint,
    useTls: relay?.useTls ?? true,
    publicUseTls: relay?.publicUseTls ?? relay?.useTls ?? true,
    appBaseUrl: config.app?.baseUrl ?? OFFICIAL_APP_BASE_URL,
  };
}

function isValidRelayEndpoint(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || /[/?#@]/.test(trimmed)) {
    return false;
  }
  try {
    const url = new URL(`ws://${trimmed}`);
    if (!url.hostname || !url.port) {
      return false;
    }
    const port = Number(url.port);
    return Number.isInteger(port) && port > 0 && port <= 65535;
  } catch {
    return false;
  }
}

function isValidAppBaseUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveRelayPatch(draft: RelayDraft, enabled: boolean): MutableDaemonConfigPatch["relay"] {
  const endpoint = draft.mode === "official" ? OFFICIAL_RELAY_ENDPOINT : draft.endpoint.trim();
  const publicEndpoint =
    draft.mode === "official" ? OFFICIAL_RELAY_ENDPOINT : draft.publicEndpoint.trim() || endpoint;
  const useTls = draft.mode === "official" ? true : draft.useTls;
  const publicUseTls = draft.mode === "official" ? true : draft.publicUseTls;
  return { enabled, endpoint, publicEndpoint, useTls, publicUseTls };
}

/**
 * Relay transport settings for one host. The official relay is a preset, not a separate code
 * path: both modes write the same endpoint/TLS fields, so switching back restores the official
 * values.
 */
export function HostRelaySection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const { config, isLoading, patchConfig } = useDaemonConfig(serverId);
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const features = client?.getLastServerInfoMessage()?.features;
  const supportsRelay = features?.relayConfig === true;
  const supportsEndpoint = features?.relayEndpointConfig === true;

  const handleOpen = useCallback(() => {
    setIsEditing(true);
    setUpdateError(null);
  }, []);
  const handleClose = useCallback(() => setIsEditing(false), []);
  const handleSaved = useCallback(() => setIsEditing(false), []);
  const handleToggleEnabled = useCallback(
    (next: boolean) => {
      setIsUpdating(true);
      setUpdateError(null);
      void patchConfig({ relay: { enabled: next } })
        .then(() =>
          queryClient.invalidateQueries({ queryKey: daemonPairingOfferQueryKey(serverId) }),
        )
        .catch((error) => {
          setUpdateError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => setIsUpdating(false));
    },
    [patchConfig, queryClient, serverId],
  );

  const summary = useMemo(() => {
    if (!config) return t("common.loading");
    if (!config.relay?.enabled) return t("settings.host.relay.statusDisabled");
    if (isOfficialRelay(config)) return t("settings.host.relay.statusOfficial");
    return config.relay.endpoint ?? t("settings.host.relay.statusOfficial");
  }, [config, t]);

  if (!isConnected || !supportsRelay) return null;

  return (
    <>
      <SettingsSection title={t("settings.host.relay.title")} testID="host-relay-section">
        <SettingsCard>
          <SettingsRow
            label={t("settings.host.relay.enabled")}
            hint={t("settings.host.relay.enabledHint")}
            error={updateError}
            testID="host-relay-enabled-row"
          >
            <Switch
              value={config?.relay?.enabled ?? false}
              onValueChange={handleToggleEnabled}
              disabled={isLoading || isUpdating || !config}
              accessibilityLabel={t("settings.host.relay.enabled")}
              testID="host-relay-enabled-switch"
            />
          </SettingsRow>
          <SettingsRow
            label={t("settings.host.relay.server")}
            hint={supportsEndpoint ? summary : t("settings.host.relay.updateRequired")}
            testID="host-relay-server-row"
          >
            <Button
              variant="outline"
              size="sm"
              onPress={handleOpen}
              disabled={!supportsEndpoint || isLoading || !config}
              testID="host-relay-configure"
            >
              {t("settings.host.relay.configure")}
            </Button>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      {isEditing && config ? (
        <RelaySettingsModal
          serverId={serverId}
          config={config}
          patchConfig={patchConfig}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      ) : null}
    </>
  );
}

function RelaySettingsModal({
  serverId,
  config,
  patchConfig,
  onClose,
  onSaved,
}: {
  serverId: string;
  config: MutableDaemonConfig;
  patchConfig: (patch: MutableDaemonConfigPatch) => Promise<MutableDaemonConfig | undefined>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RelayDraft>(() => initialDraft(config));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const header = useMemo<SheetHeader>(() => ({ title: t("settings.host.relay.modalTitle") }), [t]);

  const setMode = useCallback((mode: RelayMode) => {
    setDraft((current) => {
      if (current.mode === mode) return current;
      if (mode === "official") {
        return {
          ...current,
          mode,
          endpoint: OFFICIAL_RELAY_ENDPOINT,
          publicEndpoint: OFFICIAL_RELAY_ENDPOINT,
          useTls: true,
          publicUseTls: true,
        };
      }
      return {
        ...current,
        mode,
        endpoint: current.endpoint === OFFICIAL_RELAY_ENDPOINT ? "" : current.endpoint,
        publicEndpoint:
          current.publicEndpoint === OFFICIAL_RELAY_ENDPOINT ? "" : current.publicEndpoint,
      };
    });
  }, []);

  const setEndpoint = useCallback((endpoint: string) => {
    setDraft((current) => ({ ...current, endpoint }));
  }, []);
  const setPublicEndpoint = useCallback((publicEndpoint: string) => {
    setDraft((current) => ({ ...current, publicEndpoint }));
  }, []);
  const setAppBaseUrl = useCallback((appBaseUrl: string) => {
    setDraft((current) => ({ ...current, appBaseUrl }));
  }, []);
  const setUseTls = useCallback((useTls: boolean) => {
    setDraft((current) => ({ ...current, useTls }));
  }, []);
  const setPublicUseTls = useCallback((publicUseTls: boolean) => {
    setDraft((current) => ({ ...current, publicUseTls }));
  }, []);

  const handleSave = useCallback(() => {
    const endpoint = draft.mode === "official" ? OFFICIAL_RELAY_ENDPOINT : draft.endpoint.trim();
    const publicEndpoint =
      draft.mode === "official" ? OFFICIAL_RELAY_ENDPOINT : draft.publicEndpoint.trim() || endpoint;
    if (!isValidRelayEndpoint(endpoint) || !isValidRelayEndpoint(publicEndpoint)) {
      setError(t("settings.host.relay.invalidEndpoint"));
      return;
    }
    if (!isValidAppBaseUrl(draft.appBaseUrl)) {
      setError(t("settings.host.relay.invalidAppUrl"));
      return;
    }

    setError(null);
    setIsSaving(true);
    void patchConfig({
      relay: resolveRelayPatch(draft, config.relay?.enabled ?? false),
      app: { baseUrl: draft.appBaseUrl.trim() },
    })
      .then((next) => {
        if (!next) throw new Error(t("workspace.terminal.hostDisconnected"));
        void queryClient.invalidateQueries({ queryKey: daemonPairingOfferQueryKey(serverId) });
        onSaved();
        return next;
      })
      .catch((saveError) => {
        setError(saveError instanceof Error ? saveError.message : String(saveError));
      })
      .finally(() => setIsSaving(false));
  }, [config.relay?.enabled, draft, onSaved, patchConfig, queryClient, serverId, t]);

  const modeOptions = useMemo(
    () => [
      {
        value: "official" as const,
        label: t("settings.host.relay.official"),
        testID: "relay-mode-official",
      },
      {
        value: "custom" as const,
        label: t("settings.host.relay.custom"),
        testID: "relay-mode-custom",
      },
    ],
    [t],
  );

  return (
    <AdaptiveModalSheet
      header={header}
      visible
      onClose={onClose}
      desktopMaxWidth={520}
      testID="relay-settings-modal"
    >
      <View style={styles.form}>
        <Field label={t("settings.host.relay.mode")}>
          <SegmentedControl
            options={modeOptions}
            value={draft.mode}
            onValueChange={setMode}
            size={isCompact ? "md" : "sm"}
            testID="relay-mode"
          />
        </Field>

        {draft.mode === "custom" ? (
          <>
            <Field
              label={t("settings.host.relay.endpoint")}
              hint={t("settings.host.relay.endpointHint")}
              testID="relay-endpoint-field"
            >
              <FormTextInput
                initialValue={draft.endpoint}
                onChangeText={setEndpoint}
                placeholder="relay.example.com:443"
                autoCapitalize="none"
                autoCorrect={false}
                size={isCompact ? "md" : "sm"}
                testID="relay-endpoint-input"
              />
            </Field>
            <Field
              label={t("settings.host.relay.publicEndpoint")}
              hint={t("settings.host.relay.publicEndpointHint")}
              testID="relay-public-endpoint-field"
            >
              <FormTextInput
                initialValue={draft.publicEndpoint}
                onChangeText={setPublicEndpoint}
                placeholder="relay.example.com:443"
                autoCapitalize="none"
                autoCorrect={false}
                size={isCompact ? "md" : "sm"}
                testID="relay-public-endpoint-input"
              />
            </Field>
            <SettingsCard>
              <SettingsRow
                label={t("settings.host.relay.useTls")}
                hint={t("settings.host.relay.useTlsHint")}
              >
                <Switch
                  value={draft.useTls}
                  onValueChange={setUseTls}
                  accessibilityLabel={t("settings.host.relay.useTls")}
                  testID="relay-use-tls"
                />
              </SettingsRow>
              <SettingsRow
                label={t("settings.host.relay.publicUseTls")}
                hint={t("settings.host.relay.publicUseTlsHint")}
              >
                <Switch
                  value={draft.publicUseTls}
                  onValueChange={setPublicUseTls}
                  accessibilityLabel={t("settings.host.relay.publicUseTls")}
                  testID="relay-public-use-tls"
                />
              </SettingsRow>
            </SettingsCard>
          </>
        ) : null}

        <Field
          label={t("settings.host.relay.appBaseUrl")}
          hint={t("settings.host.relay.appBaseUrlHint")}
          testID="relay-app-base-url-field"
        >
          <FormTextInput
            initialValue={draft.appBaseUrl}
            onChangeText={setAppBaseUrl}
            placeholder={OFFICIAL_APP_BASE_URL}
            autoCapitalize="none"
            autoCorrect={false}
            size={isCompact ? "md" : "sm"}
            testID="relay-app-base-url-input"
          />
        </Field>

        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button variant="secondary" size="sm" onPress={onClose} disabled={isSaving}>
            {t("common.actions.cancel")}
          </Button>
          <Button variant="default" size="sm" onPress={handleSave} loading={isSaving}>
            {t("common.actions.save")}
          </Button>
        </View>
      </View>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  form: {
    gap: theme.spacing[4],
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  error: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.sm,
  },
}));
