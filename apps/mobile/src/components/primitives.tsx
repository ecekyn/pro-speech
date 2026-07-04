import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors, gradients, glass, radii, spacing } from '../theme';
import { Mistake } from '../services/api';
import { formatDuration } from '../utils/format';

export type Tone = 'neutral' | 'live' | 'busy' | 'success' | 'warning' | 'info';

const TONE_STYLES: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.inkMuted, bg: 'rgba(19, 21, 42, 0.06)' },
  live: { fg: colors.coralDeep, bg: colors.coralTint },
  busy: { fg: colors.indigoDeep, bg: colors.indigoTint },
  success: { fg: colors.green, bg: colors.greenTint },
  warning: { fg: colors.amber, bg: colors.amberTint },
  info: { fg: colors.tealDeep, bg: colors.tealTint },
};

const STAT_TONE_COLORS = {
  indigo: colors.indigo,
  teal: colors.teal,
  amber: colors.amber,
  coral: colors.coral,
  green: colors.green,
} as const;

// ---------- Backdrop ----------

export function GradientBackdrop() {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <View style={styles.backdropBase} />
      <View style={[styles.blob, styles.blobIndigo]} />
      <View style={[styles.blob, styles.blobTeal]} />
      <View style={[styles.blob, styles.blobCoral]} />
    </View>
  );
}

// ---------- Glass panel ----------

export function GlassPanel({
  children,
  style,
  tone = 'strong',
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'strong' | 'soft';
}) {
  return (
    <View
      style={[tone === 'soft' ? glass.panelSoft : glass.panel, styles.panelPadding, style]}
    >
      {children}
    </View>
  );
}

// ---------- Chip ----------

export function Chip({
  label,
  tone = 'neutral',
  style,
}: {
  label: string;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
}) {
  const toneStyle = TONE_STYLES[tone];
  return (
    <View style={[styles.chip, { backgroundColor: toneStyle.bg }, style]}>
      <Text style={[styles.chipText, { color: toneStyle.fg }]}>{label}</Text>
    </View>
  );
}

// ---------- Divider ----------

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

// ---------- Chevron glyph ----------

export function ChevronGlyph({ color = colors.inkFaint }: { color?: string }) {
  return <Text style={[styles.chevron, { color }]}>{'›'}</Text>;
}

// ---------- Screen intro ----------

export function ScreenIntro({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.screenIntro}>
      <Text style={styles.screenTitle}>{title}</Text>
      <Text style={styles.screenSubtitle}>{subtitle}</Text>
    </View>
  );
}

// ---------- Section header ----------

export function SectionHeader({
  title,
  badge,
  badgeTone = 'neutral',
}: {
  title: string;
  badge?: string;
  badgeTone?: Tone;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {badge ? <Chip label={badge} tone={badgeTone} /> : null}
    </View>
  );
}

// ---------- Stat strip ----------

export interface StatEntry {
  label: string;
  value: string;
  tone?: keyof typeof STAT_TONE_COLORS;
}

export function StatStrip({ items }: { items: StatEntry[] }) {
  return (
    <View style={styles.statStrip}>
      {items.map((item, index) => (
        <React.Fragment key={item.label}>
          {index > 0 ? <View style={styles.statDivider} /> : null}
          <View style={styles.statItem}>
            <Text
              style={[
                styles.statValue,
                { color: item.tone ? STAT_TONE_COLORS[item.tone] : colors.ink },
              ]}
            >
              {item.value}
            </Text>
            <Text style={styles.statLabel}>{item.label}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

// ---------- Tappable row ----------

export function TappableRow({
  title,
  subtitle,
  onPress,
  dotTone = 'neutral',
  disabled,
}: {
  title: string;
  subtitle: string;
  onPress?: () => void;
  dotTone?: Tone;
  disabled?: boolean;
}) {
  const content = (
    <>
      <View style={[styles.rowDot, { backgroundColor: TONE_STYLES[dotTone].fg }]} />
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      {onPress ? <ChevronGlyph /> : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
        disabled && styles.rowDisabled,
      ]}
    >
      {content}
    </Pressable>
  );
}

// ---------- Capture hub ----------

export interface CaptureHubProps {
  eyebrow: string;
  title: string;
  stateLabel: string;
  stateTone: Tone;
  description?: string;
  timerSeconds: number;
  timerCaption: string;
  isActive: boolean;
  activeActionLabel: string;
  idleActionLabel: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  busyText?: string;
  footer?: React.ReactNode;
}

export function CaptureHub({
  eyebrow,
  title,
  stateLabel,
  stateTone,
  description,
  timerSeconds,
  timerCaption,
  isActive,
  activeActionLabel,
  idleActionLabel,
  onPress,
  disabled,
  busy,
  busyText,
  footer,
}: CaptureHubProps) {
  return (
    <GlassPanel style={styles.hub}>
      <View style={styles.hubHeader}>
        <View style={styles.hubHeaderCopy}>
          <Text style={styles.hubEyebrow}>{eyebrow}</Text>
          <Text style={styles.hubTitle}>{title}</Text>
        </View>
        <Chip label={stateLabel} tone={stateTone} />
      </View>

      {description ? <Text style={styles.hubDescription}>{description}</Text> : null}

      <View style={styles.hubTimerBlock}>
        <Text style={styles.hubTimer}>{formatDuration(timerSeconds)}</Text>
        <Text style={styles.hubTimerCaption}>{timerCaption}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isActive ? activeActionLabel : idleActionLabel}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.hubButton,
          {
            experimental_backgroundImage: isActive ? gradients.danger : gradients.primary,
          },
          pressed && styles.hubButtonPressed,
          disabled && styles.hubButtonDisabled,
        ]}
      >
        {isActive ? <View style={styles.hubStopGlyph} /> : <View style={styles.hubRecordGlyph} />}
      </Pressable>

      <Text style={styles.hubActionLabel}>
        {isActive ? activeActionLabel : idleActionLabel}
      </Text>

      {busy ? (
        <View style={styles.hubBusyRow}>
          <ActivityIndicator color={colors.teal} />
          <Text style={styles.hubBusyText}>{busyText}</Text>
        </View>
      ) : null}

      {footer}
    </GlassPanel>
  );
}

// ---------- Mistake list ----------

export function MistakeList({
  mistakes,
  emptyTitle,
  emptyText,
}: {
  mistakes: Mistake[];
  emptyTitle: string;
  emptyText: string;
}) {
  if (mistakes.length === 0) {
    return <InfoBanner tone="success" title={emptyTitle} text={emptyText} />;
  }

  return (
    <View>
      {mistakes.map((mistake, index) => (
        <View key={`${mistake.original}-${index}`}>
          {index > 0 ? <Divider style={styles.mistakeDivider} /> : null}
          <View style={styles.mistakeRow}>
            <View style={styles.mistakeRowHeader}>
              <Text style={styles.mistakeCategory}>
                {mistake.category || 'Pattern'}
                {mistake.speaker ? `  ·  ${mistake.speaker}` : ''}
              </Text>
              <Text style={styles.mistakeCount}>{mistake.count || 1}×</Text>
            </View>
            <Text style={styles.mistakeOriginal}>{'✖'} {mistake.original}</Text>
            <Text style={styles.mistakeCorrection}>{'✓'} {mistake.correction}</Text>
            <Text style={styles.mistakeReason}>{mistake.reason}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ---------- Info banner ----------

export function InfoBanner({
  tone = 'neutral',
  title,
  text,
  loading,
}: {
  tone?: Tone;
  title?: string;
  text: string;
  loading?: boolean;
}) {
  const toneStyle = TONE_STYLES[tone];
  return (
    <View style={[styles.banner, { backgroundColor: toneStyle.bg }]}>
      {title || loading ? (
        <View style={styles.bannerHeaderRow}>
          {loading ? <ActivityIndicator size="small" color={toneStyle.fg} /> : null}
          {title ? (
            <Text style={[styles.bannerTitle, { color: toneStyle.fg }]}>{title}</Text>
          ) : null}
        </View>
      ) : null}
      <Text style={[styles.bannerText, { color: title ? toneStyle.fg : colors.inkMuted }]}>
        {text}
      </Text>
    </View>
  );
}

// ---------- Transcript block ----------

export function TranscriptBlock({ label, text }: { label: string; text: string }) {
  return (
    <View style={styles.transcriptBlock}>
      <Text style={styles.transcriptLabel}>{label}</Text>
      <Text style={styles.transcriptText}>{text}</Text>
    </View>
  );
}

// ---------- Timeline step ----------

export function TimelineStep({
  index,
  title,
  text,
  isLast,
}: {
  index: number;
  title: string;
  text: string;
  isLast?: boolean;
}) {
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineIndicator}>
        <View style={styles.timelineDot}>
          <Text style={styles.timelineDotText}>{index}</Text>
        </View>
        {!isLast ? <View style={styles.timelineLine} /> : null}
      </View>
      <View style={styles.timelineCopy}>
        <Text style={styles.timelineTitle}>{title}</Text>
        <Text style={styles.timelineText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdropBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#EEF2FF',
    experimental_backgroundImage: gradients.screen,
  },
  blob: {
    position: 'absolute',
    borderRadius: radii.pill,
  },
  blobIndigo: {
    width: 380,
    height: 380,
    top: -100,
    left: -120,
    experimental_backgroundImage: gradients.blobIndigo,
  },
  blobTeal: {
    width: 420,
    height: 420,
    top: 140,
    right: -170,
    experimental_backgroundImage: gradients.blobTeal,
  },
  blobCoral: {
    width: 320,
    height: 320,
    bottom: -150,
    left: -90,
    experimental_backgroundImage: gradients.blobCoral,
  },
  panelPadding: {
    padding: spacing.lg,
  },
  chip: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },
  chevron: {
    fontSize: 20,
    fontWeight: '700',
    marginLeft: spacing.sm,
  },
  screenIntro: {
    marginBottom: spacing.xl,
  },
  screenTitle: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    color: colors.inkMuted,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  statStrip: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
  },
  statDivider: {
    backgroundColor: colors.hairlineStrong,
    marginHorizontal: spacing.lg,
    width: StyleSheet.hairlineWidth,
  },
  statItem: {
    flex: 1,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statLabel: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingVertical: spacing.md,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  rowDot: {
    borderRadius: radii.pill,
    height: 10,
    marginRight: spacing.md,
    width: 10,
  },
  rowCopy: {
    flex: 1,
  },
  rowTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  rowSubtitle: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    marginTop: 2,
  },
  hub: {
    alignItems: 'center',
  },
  hubHeader: {
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  hubHeaderCopy: {
    flex: 1,
    paddingRight: spacing.md,
  },
  hubEyebrow: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  hubTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginTop: 2,
  },
  hubDescription: {
    alignSelf: 'stretch',
    color: colors.inkMuted,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    marginTop: spacing.md,
  },
  hubTimerBlock: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  hubTimer: {
    color: colors.ink,
    fontSize: 46,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
    letterSpacing: -1,
  },
  hubTimerCaption: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  hubButton: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.55)',
    borderRadius: radii.pill,
    borderWidth: 4,
    boxShadow: [
      { offsetX: 0, offsetY: 14, blurRadius: 28, color: 'rgba(50, 70, 170, 0.35)' },
    ],
    height: 116,
    justifyContent: 'center',
    marginTop: spacing.xl,
    width: 116,
  },
  hubButtonPressed: {
    opacity: 0.88,
  },
  hubButtonDisabled: {
    opacity: 0.45,
  },
  hubRecordGlyph: {
    backgroundColor: colors.onAccent,
    borderRadius: radii.pill,
    height: 30,
    width: 30,
  },
  hubStopGlyph: {
    backgroundColor: colors.onAccent,
    borderRadius: 8,
    height: 28,
    width: 28,
  },
  hubActionLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    marginTop: spacing.md,
  },
  hubBusyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  hubBusyText: {
    color: colors.tealDeep,
    fontSize: 13,
    fontWeight: '600',
  },
  mistakeDivider: {
    marginVertical: spacing.md,
  },
  mistakeRow: {
    gap: 6,
  },
  mistakeRowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mistakeCategory: {
    color: colors.inkFaint,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  mistakeCount: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '700',
  },
  mistakeOriginal: {
    color: colors.coralDeep,
    fontSize: 15,
    fontWeight: '700',
    textDecorationLine: 'line-through',
  },
  mistakeCorrection: {
    color: colors.green,
    fontSize: 15,
    fontWeight: '800',
  },
  mistakeReason: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  banner: {
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  bannerHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: 4,
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  transcriptBlock: {
    borderTopColor: colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.lg,
  },
  transcriptLabel: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  transcriptText: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  timelineRow: {
    flexDirection: 'row',
  },
  timelineIndicator: {
    alignItems: 'center',
    width: 28,
  },
  timelineDot: {
    alignItems: 'center',
    backgroundColor: colors.indigoTint,
    borderRadius: radii.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  timelineDotText: {
    color: colors.indigoDeep,
    fontSize: 13,
    fontWeight: '800',
  },
  timelineLine: {
    backgroundColor: colors.hairlineStrong,
    flex: 1,
    marginVertical: 4,
    minHeight: 24,
    width: StyleSheet.hairlineWidth,
  },
  timelineCopy: {
    flex: 1,
    paddingBottom: spacing.xl,
    paddingLeft: spacing.md,
  },
  timelineTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  timelineText: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    marginTop: 2,
  },
});
