import { useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { MarkdownRenderer } from "@/components/markdown/renderer";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { Theme } from "@/styles/theme";

export interface SideQuestionState {
  question: string;
  answer: string | null;
  error: string | null;
  loading: boolean;
}

const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/** The transient answer to /btw. It is never written into the agent timeline. */
export function SideQuestionSheet({
  state,
  onClose,
}: {
  state: SideQuestionState | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const header = useMemo(() => ({ title: "/btw", subtitle: state?.question }), [state?.question]);

  let content = null;
  if (state?.loading) {
    content = (
      <View style={styles.loadingRow}>
        <ThemedLoadingSpinner size="small" uniProps={mutedColorMapping} />
        <Text style={styles.mutedText}>{t("composer.sideQuestion.loading")}</Text>
      </View>
    );
  } else if (state?.error) {
    content = <Text style={styles.errorText}>{state.error}</Text>;
  } else if (state?.answer) {
    content = <MarkdownRenderer text={state.answer} />;
  }

  return (
    <AdaptiveModalSheet
      header={header}
      visible={state !== null}
      onClose={onClose}
      testID="side-question-sheet"
    >
      {content}
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  mutedText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  errorText: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.base,
  },
}));
