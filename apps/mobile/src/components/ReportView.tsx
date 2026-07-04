import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DailyReport, Mistake } from '../services/api';

interface Props {
  report: DailyReport | null;
  reportUnlocked: boolean;
}

export function ReportView({ report, reportUnlocked }: Props) {
  if (!report) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tonight's report</Text>
        <Text style={styles.mutedText}>No conversations analyzed today.</Text>
      </View>
    );
  }

  if (!reportUnlocked) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tonight's report</Text>
        <Text style={styles.summary}>
          The top 3 speaking mistakes report appears at 8:00 PM.
        </Text>
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
      <Text style={styles.sectionTitle}>Top 3 speaking mistakes today</Text>
      <Text style={styles.summary}>{report.summary}</Text>

      {report.top_mistakes.length > 0 ? (
        report.top_mistakes.map((mistake, index) => (
          <MistakeRow key={`${mistake.original}-${index}`} mistake={mistake} />
        ))
      ) : (
        <Text style={styles.noMistakes}>
          No recurring speaking mistakes found in today's analyzed
          conversations.
        </Text>
      )}
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
        <Text style={styles.category}>{mistake.category || 'pattern'}</Text>
        <Text style={styles.count}>{mistake.count || 1}x</Text>
      </View>
      <Text style={styles.original}>{mistake.original}</Text>
      <Text style={styles.correction}>Use: {mistake.correction}</Text>
      <Text style={styles.reason}>{mistake.reason}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  summary: {
    color: '#4B5563',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  mutedText: {
    color: '#6B7280',
    fontSize: 14,
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statItem: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  statValue: {
    color: '#0F766E',
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 2,
  },
  mistakeCard: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginTop: 10,
  },
  mistakeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  category: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  count: {
    color: '#0F766E',
    fontSize: 13,
    fontWeight: '700',
  },
  original: {
    color: '#B91C1C',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
    textDecorationLine: 'line-through',
  },
  correction: {
    color: '#166534',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  reason: {
    color: '#4B5563',
    fontSize: 13,
    lineHeight: 19,
  },
  noMistakes: {
    color: '#166534',
    fontSize: 14,
    lineHeight: 20,
  },
});
