import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DailyReport } from '../services/api';
import { Divider, InfoBanner, MistakeList, SectionHeader } from './primitives';
import { colors, spacing } from '../theme';

interface Props {
  report: DailyReport | null;
  reportUnlocked: boolean;
}

export function ReportView({ report, reportUnlocked }: Props) {
  if (!report) {
    return (
      <View style={styles.section}>
        <SectionHeader title="Daily report" badge="Empty" />
        <InfoBanner text="Your report will build here once you record a conversation today." />
      </View>
    );
  }

  if (!reportUnlocked) {
    return (
      <View style={styles.section}>
        <SectionHeader title="Daily report" badge="8:00 PM" badgeTone="warning" />
        <Text style={styles.summary}>
          {report.session_count} session{report.session_count === 1 ? '' : 's'}{' '}
          recorded so far today. Top patterns appear at 8:00 PM.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <SectionHeader title="Daily report" badge="Ready" badgeTone="success" />
      <Text style={styles.summary}>{report.summary}</Text>
      <Divider />
      <MistakeList
        mistakes={report.top_mistakes}
        emptyTitle="No recurring patterns"
        emptyText="Today's analyzed conversations did not show repeated mistakes."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  summary: {
    color: colors.inkMuted,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
});
