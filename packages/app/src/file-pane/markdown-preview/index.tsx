import { MarkdownRenderer } from "@/components/markdown/renderer";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useCallback, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View, type LayoutChangeEvent } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useAppSettings } from "@/hooks/use-settings";
import { parseMarkdownPreviewDocument, type MarkdownFrontMatterRow } from "./document";
import {
  buildMarkdownOutline,
  visibleMarkdownOutlineItems,
  type MarkdownOutlineItem,
  type MarkdownOutlineSection,
} from "./outline";
import { MarkdownOutlineSidebar } from "./outline-view";

const OUTLINE_SCROLL_GAP = 8;

export function FileMarkdownPreview({
  source,
  filePath,
  workspaceRoot,
  client,
  serverId,
}: {
  source: string;
  filePath: string;
  workspaceRoot?: string;
  client?: DaemonClient | null;
  serverId?: string;
}) {
  const { settings } = useAppSettings();
  const document = useMemo(() => parseMarkdownPreviewDocument(source), [source]);
  const outline = useMemo(() => {
    if (!settings.markdownOutlineEnabled) {
      return {
        items: [],
        sections: document.body.trim() ? [{ id: "section-document", source: document.body }] : [],
      };
    }
    return buildMarkdownOutline(document.body, settings.markdownOutlineDepth);
  }, [document.body, settings.markdownOutlineDepth, settings.markdownOutlineEnabled]);
  const showOutline = outline.items.length > 0;
  const [outlineExpanded, setOutlineExpanded] = useState(true);
  const [collapsedOutlineItems, setCollapsedOutlineItems] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const visibleOutlineItems = useMemo(
    () => visibleMarkdownOutlineItems(outline.items, collapsedOutlineItems),
    [outline.items, collapsedOutlineItems],
  );
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef(new Map<string, number>());

  const handleSectionLayout = useCallback((sectionId: string, event: LayoutChangeEvent) => {
    sectionOffsets.current.set(sectionId, event.nativeEvent.layout.y);
  }, []);

  const handleSelectOutlineItem = useCallback((item: MarkdownOutlineItem) => {
    const offset = sectionOffsets.current.get(item.sectionId);
    if (offset === undefined) return;
    scrollRef.current?.scrollTo({
      y: Math.max(0, offset - OUTLINE_SCROLL_GAP),
      animated: true,
    });
  }, []);

  const toggleOutline = useCallback(() => setOutlineExpanded((expanded) => !expanded), []);
  const toggleOutlineItem = useCallback((item: MarkdownOutlineItem) => {
    setCollapsedOutlineItems((collapsed) => {
      const next = new Set(collapsed);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }, []);
  const outlineSidebar = showOutline ? (
    <MarkdownOutlineSidebar
      items={visibleOutlineItems}
      collapsedItemIds={collapsedOutlineItems}
      position={settings.markdownOutlinePosition}
      expanded={outlineExpanded}
      onToggleExpanded={toggleOutline}
      onToggleItem={toggleOutlineItem}
      onSelect={handleSelectOutlineItem}
    />
  ) : null;

  return (
    <View style={styles.root} testID="markdown-preview">
      {settings.markdownOutlinePosition === "left" ? outlineSidebar : null}
      <View style={styles.main}>
        <ScrollView ref={scrollRef} style={styles.scroll} showsVerticalScrollIndicator>
          <View style={styles.outerGutter}>
            <View style={styles.readingFrame} testID="markdown-preview-frame">
              {document.frontMatter.length > 0 ? (
                <FrontMatterTable rows={document.frontMatter} />
              ) : null}
              {outline.sections.map((section) => (
                <MarkdownSection
                  key={section.id}
                  section={section}
                  filePath={filePath}
                  workspaceRoot={workspaceRoot}
                  client={client}
                  serverId={serverId}
                  onLayout={handleSectionLayout}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
      {settings.markdownOutlinePosition === "right" ? outlineSidebar : null}
    </View>
  );
}

function FrontMatterTable({ rows }: { rows: readonly MarkdownFrontMatterRow[] }) {
  return (
    <View style={styles.frontMatterTable} testID="markdown-front-matter">
      {rows.map((row, index) => (
        <View
          key={row.key}
          style={[styles.frontMatterRow, index > 0 && styles.frontMatterRowBorder]}
        >
          <View style={styles.frontMatterKeyCell}>
            <Text selectable style={styles.frontMatterKey}>
              {row.key}
            </Text>
          </View>
          <View style={styles.frontMatterValueCell}>
            <Text selectable style={styles.frontMatterValue}>
              {row.value}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function MarkdownSection({
  section,
  filePath,
  workspaceRoot,
  client,
  serverId,
  onLayout,
}: {
  section: MarkdownOutlineSection;
  filePath: string;
  workspaceRoot?: string;
  client?: DaemonClient | null;
  serverId?: string;
  onLayout: (sectionId: string, event: LayoutChangeEvent) => void;
}) {
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => onLayout(section.id, event),
    [onLayout, section.id],
  );
  return (
    <View onLayout={handleLayout}>
      <MarkdownRenderer
        text={section.source}
        filePath={filePath}
        workspaceRoot={workspaceRoot}
        client={client}
        serverId={serverId}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    backgroundColor: theme.colors.surface0,
  },
  main: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  outerGutter: {
    width: "100%",
    paddingHorizontal: {
      xs: theme.spacing[3],
      md: theme.spacing[4],
    },
  },
  readingFrame: {
    width: "100%",
    maxWidth: theme.contentMaxWidth,
    alignSelf: "center",
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[4],
  },
  frontMatterTable: {
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    overflow: "hidden",
    marginBottom: theme.spacing[6],
  },
  frontMatterRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  frontMatterRowBorder: {
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
  },
  frontMatterKeyCell: {
    flexBasis: "30%",
    maxWidth: 180,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surface2,
  },
  frontMatterValueCell: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  frontMatterKey: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.base,
    lineHeight: 20,
  },
  frontMatterValue: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: 20,
  },
}));
