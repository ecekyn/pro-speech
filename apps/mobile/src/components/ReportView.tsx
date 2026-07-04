import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DailyReport, Mistake } from '../services/api';
import { colors, shadows } from '../theme';

interface Props {
  report: DailyReport | null;
  reportUnlocked: boolean;
}

export function ReportView({ report, reportUnlocked }: Props) {
  if (!report) {
    return (
      <View style={styles.section}>
        <SectionHeader title="Daily report" badge="Empty" />
        <View style={styles.emptyPanel}>
          <Text style={styles.emptyTitle}>No sessions today</Text>
          <Text style={styles.mutedText}>Your report will build here.</Text>
        </View>
      </View>
    );
  }

  if (!reportUnlocked) {
    return (
      <View style={styles.section}>
        <SectionHeader title="Daily report" badge="8:00 PM" />
        <Text style={styles.summary}>Top patterns appear at 8:00 PM.</Text>
        <View style={styles.statRow}>
          <ReportStat label="Sessions" value={String(report.session_count)} />
          <ReportStat
            label="Minutes"
            value={String(report.transcript_minutes)}
          />
          <ReportStat
            label="Patterns"
            value={String(report.top_mistakes.length)}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <SectionHeader title="Daily report" badge="Ready" />
      <Text style={styles.summary}>{report.summary}</Text>

      {report.top_mistakes.length > 0 ? (
        report.top_mistakes.map((mistake, index) => (
          <MistakeRow key={`${mistake.original}-${index}`} mistake={mistake} />
        ))
      ) : (
        <View style={styles.successPanel}>
          <Text style={styles.successTitle}>No recurring patterns</Text>
          <Text style={styles.noMistakes}>
            Today's analyzed conversations did not show repeated mistakes.
          </Text>
        </View>
      )}
    </View>
  );
}

function SectionHeader({ title, badge }: { title: string; badge: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{badge}</Text>
      </View>
    </View>
  );
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MistakeRow({ mistake }: { mistake: Mistake }) {
  return (
    <View style={styles.mistakeCard}>
      <View style={styles.mistakeHeader}>
        <Text style={styles.category}>{mistake.category || 'Pattern'}</Text>
        <Text style={styles.count}>{mistake.count || 1}x</Text>
      </View>
      <View style={styles.phraseBlock}>
        <Text style={styles.phraseLabel}>Heard</Text>
        <Text style={styles.original}>{mistake.original}</Text>
      </View>
      <View style={[styles.phraseBlock, styles.phraseBlockCorrect]}>
        <Text style={styles.phraseLabel}>Use</Text>
        <Text style={styles.correction}>{mistake.correction}</Text>
      </View>
      <Text style={styles.reason}>{mistake.reason}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0,
  },
  badge: {
    backgroundColor: colors.tealSoft,
    borderColor: colors.glassStroke,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    color: colors.tealDark,
    fontSize: 12,
    fontWeight: '800',
  },
  summary: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  emptyPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.glassStroke,
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
    ...shadows.card,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  mutedText: {
    color: colors.inkSubtle,
    fontSize: 14,
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statItem: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.glassStroke,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    ...shadows.card,
  },
  statValue: {
    color: colors.teal,
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.inkSubtle,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  mistakeCard: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.glassStroke,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 10,
    padding: 14,
    ...shadows.card,
  },
  mistakeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  category: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  count: {
    color: colors.teal,
    fontSize: 13,
    fontWeight: '800',
  },
  phraseBlock: {
    backgroundColor: colors.redSoft,
    borderRadius: 8,
    marginBottom: 8,
    padding: 10,
  },
  phraseBlockCorrect: {
    backgroundColor: colors.greenSoft,
  },
  phraseLabel: {
    color: colors.inkSubtle,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  original: {
    color: colors.red,
    fontSize: 15,
    fontWeight: '800',
    textDecorationLine: 'line-through',
  },
  correction: {
    color: colors.green,
    fontSize: 15,
    fontWeight: '800',
  },
  reason: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  successPanel: {
    backgroundColor: colors.greenSoft,
    borderColor: colors.glassStroke,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  successTitle: {
    color: colors.green,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  noMistakes: {
    color: colors.green,
    fontSize: 14,
    lineHeight: 20,
  },
});
