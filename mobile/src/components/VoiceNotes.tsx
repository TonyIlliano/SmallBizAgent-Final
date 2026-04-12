import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert, Keyboard } from 'react-native';
import { Text, Card, TextInput, Button, Divider, Chip, ActivityIndicator } from 'react-native-paper';
import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { processVoiceNotes, ParsedVoiceNotes } from '../api/jobs';
import { theme } from '../theme';

interface VoiceNotesProps {
  jobId: number;
  existingNotes?: string;
  onNotesSaved?: () => void;
}

export function VoiceNotes({ jobId, existingNotes, onNotesSaved }: VoiceNotesProps) {
  const [expanded, setExpanded] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsedResult, setParsedResult] = useState<ParsedVoiceNotes | null>(null);
  const [wasFallback, setWasFallback] = useState(false);

  const voiceNotesMutation = useMutation({
    mutationFn: (text: string) => processVoiceNotes(jobId, text),
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setParsedResult(data.parsed);
      setWasFallback(data.fallback || false);
      onNotesSaved?.();
    },
    onError: (error: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message || 'Failed to process voice notes');
    },
  });

  const handleProcess = useCallback(() => {
    const trimmed = transcript.trim();
    if (!trimmed) {
      Alert.alert('Empty Notes', 'Please dictate or type your job notes first.');
      return;
    }
    Keyboard.dismiss();
    voiceNotesMutation.mutate(trimmed);
  }, [transcript, voiceNotesMutation]);

  const handleReset = useCallback(() => {
    setParsedResult(null);
    setWasFallback(false);
    setTranscript('');
  }, []);

  // Collapsed state: show a button to open voice notes
  if (!expanded) {
    return (
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <Button
            mode="contained"
            onPress={() => setExpanded(true)}
            icon="microphone"
            style={styles.expandButton}
            buttonColor={theme.colors.primary}
            contentStyle={styles.expandButtonContent}
          >
            {existingNotes ? 'Update Voice Notes' : 'Add Voice Notes'}
          </Button>
          {existingNotes && (
            <View style={styles.existingNotesPreview}>
              <Text style={styles.existingNotesLabel}>Current Notes</Text>
              <Text style={styles.existingNotesText} numberOfLines={3}>
                {existingNotes}
              </Text>
            </View>
          )}
        </Card.Content>
      </Card>
    );
  }

  // Show parsed results after AI processing
  if (parsedResult) {
    return (
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <View style={styles.resultHeader}>
            <Text style={styles.sectionTitle}>
              {wasFallback ? 'Notes Saved' : 'AI-Parsed Notes'}
            </Text>
            <Chip
              mode="flat"
              style={[styles.savedChip, wasFallback && styles.savedChipFallback]}
              textStyle={styles.savedChipText}
              icon="check"
            >
              Saved
            </Chip>
          </View>

          {/* Completion Summary */}
          {parsedResult.completionSummary && !wasFallback && (
            <View style={styles.summaryBanner}>
              <Text style={styles.summaryText}>
                {parsedResult.completionSummary}
              </Text>
            </View>
          )}

          {/* Clean Notes */}
          <View style={styles.resultSection}>
            <Text style={styles.resultLabel}>Job Notes</Text>
            <Text style={styles.resultValue}>{parsedResult.notes}</Text>
          </View>

          {/* Parts Used */}
          {parsedResult.partsUsed.length > 0 && (
            <View style={styles.resultSection}>
              <Text style={styles.resultLabel}>
                Parts Used ({parsedResult.partsUsed.length})
              </Text>
              <View style={styles.partsContainer}>
                {parsedResult.partsUsed.map((part, index) => (
                  <Chip
                    key={index}
                    mode="outlined"
                    style={styles.partChip}
                    textStyle={styles.partChipText}
                    icon="wrench"
                  >
                    {part.quantity && part.quantity > 1
                      ? `${part.quantity}x ${part.name}`
                      : part.name}
                  </Chip>
                ))}
              </View>
              <Text style={styles.partsHint}>
                Parts added as line items (update prices in Line Items).
              </Text>
            </View>
          )}

          {/* Equipment Info */}
          {parsedResult.equipmentInfo && (
            <View style={styles.resultSection}>
              <Text style={styles.resultLabel}>Equipment</Text>
              <View style={styles.equipmentCard}>
                <Text style={styles.equipmentText}>
                  {parsedResult.equipmentInfo}
                </Text>
              </View>
            </View>
          )}

          {/* Follow-Up Card */}
          {parsedResult.followUpNeeded && (
            <View style={styles.followUpCard}>
              <View style={styles.followUpHeader}>
                <Text style={styles.followUpIcon}>!</Text>
                <Text style={styles.followUpTitle}>Follow-Up Needed</Text>
              </View>
              {parsedResult.followUpDescription && (
                <Text style={styles.followUpDescription}>
                  {parsedResult.followUpDescription}
                </Text>
              )}
              {parsedResult.estimatedFollowUpCost != null && (
                <Text style={styles.followUpCost}>
                  Estimated cost: ${parsedResult.estimatedFollowUpCost.toFixed(2)}
                </Text>
              )}
            </View>
          )}

          <Divider style={styles.divider} />

          {/* Actions */}
          <View style={styles.resultActions}>
            <Button
              mode="outlined"
              onPress={handleReset}
              icon="refresh"
              compact
              style={styles.resultActionButton}
            >
              Re-dictate
            </Button>
            <Button
              mode="text"
              onPress={() => setExpanded(false)}
              compact
              style={styles.resultActionButton}
            >
              Collapse
            </Button>
          </View>
        </Card.Content>
      </Card>
    );
  }

  // Input state: show TextInput for dictation
  return (
    <Card style={styles.card} mode="elevated">
      <Card.Content>
        <View style={styles.inputHeader}>
          <Text style={styles.sectionTitle}>Voice Notes</Text>
          <Button
            mode="text"
            onPress={() => setExpanded(false)}
            compact
            textColor="#9ca3af"
          >
            Cancel
          </Button>
        </View>

        <Text style={styles.dictationHint}>
          Tap the microphone on your keyboard to dictate, or type your notes.
        </Text>

        <TextInput
          mode="outlined"
          value={transcript}
          onChangeText={setTranscript}
          multiline
          numberOfLines={6}
          placeholder={
            'Example: "Replaced the capacitor on the outdoor AC unit, a 45-5 dual run cap. ' +
            'Unit is a Carrier 24ACC636, serial number 2119E. ' +
            'Noticed the contactor is pitted, customer should replace it within 6 months, ' +
            'probably a $200 repair..."'
          }
          placeholderTextColor="#c0c0c0"
          style={styles.textInput}
          outlineColor={theme.colors.outline}
          activeOutlineColor={theme.colors.primary}
          textColor={theme.colors.onBackground}
        />

        <Text style={styles.charCount}>
          {transcript.length.toLocaleString()} / 10,000 characters
        </Text>

        <Button
          mode="contained"
          onPress={handleProcess}
          loading={voiceNotesMutation.isPending}
          disabled={voiceNotesMutation.isPending || transcript.trim().length === 0}
          icon="brain"
          style={styles.processButton}
          buttonColor={theme.colors.primary}
          contentStyle={styles.processButtonContent}
        >
          {voiceNotesMutation.isPending ? 'AI Processing...' : 'Process with AI'}
        </Button>

        {voiceNotesMutation.isPending && (
          <View style={styles.processingHint}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.processingText}>
              Parsing notes, extracting parts, detecting follow-ups...
            </Text>
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    marginBottom: 12,
  },

  // Collapsed state
  expandButton: {
    borderRadius: 10,
  },
  expandButtonContent: {
    paddingVertical: 4,
  },
  existingNotesPreview: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  existingNotesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  existingNotesText: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
  },

  // Input state
  inputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  dictationHint: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
    lineHeight: 18,
  },
  textInput: {
    backgroundColor: '#fafafa',
    fontSize: 15,
    minHeight: 140,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 8,
  },
  processButton: {
    borderRadius: 10,
    marginTop: 4,
  },
  processButtonContent: {
    paddingVertical: 4,
  },
  processingHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 8,
  },
  processingText: {
    fontSize: 13,
    color: '#6b7280',
    fontStyle: 'italic',
  },

  // Results state
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  savedChip: {
    backgroundColor: '#dcfce7',
  },
  savedChipFallback: {
    backgroundColor: '#fef3c7',
  },
  savedChipText: {
    fontSize: 12,
    color: '#166534',
  },
  summaryBanner: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  summaryText: {
    fontSize: 14,
    color: '#1e40af',
    fontWeight: '500',
    lineHeight: 20,
  },
  resultSection: {
    marginBottom: 16,
  },
  resultLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  resultValue: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
  },

  // Parts chips
  partsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  partChip: {
    backgroundColor: '#f3f4f6',
    borderColor: '#d1d5db',
  },
  partChipText: {
    fontSize: 13,
    color: '#374151',
  },
  partsHint: {
    fontSize: 11,
    color: '#9ca3af',
    fontStyle: 'italic',
    marginTop: 8,
  },

  // Equipment
  equipmentCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  equipmentText: {
    fontSize: 14,
    color: '#334155',
    fontFamily: 'monospace',
  },

  // Follow-up
  followUpCard: {
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  followUpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  followUpIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: '#dc2626',
    backgroundColor: '#fee2e2',
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: 'center',
    lineHeight: 24,
    overflow: 'hidden',
  },
  followUpTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#991b1b',
  },
  followUpDescription: {
    fontSize: 14,
    color: '#7f1d1d',
    lineHeight: 20,
    marginBottom: 4,
  },
  followUpCost: {
    fontSize: 14,
    fontWeight: '600',
    color: '#991b1b',
    marginTop: 4,
  },

  // Shared
  divider: {
    backgroundColor: '#e5e7eb',
    marginVertical: 12,
  },
  resultActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 8,
  },
  resultActionButton: {
    borderRadius: 8,
  },
});
