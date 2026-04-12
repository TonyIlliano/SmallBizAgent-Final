import React from 'react';
import { Chip } from 'react-native-paper';
import { STATUS_COLORS, StatusColor } from '../theme';

interface StatusChipProps {
  status: string;
  size?: 'small' | 'default';
}

const LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  waiting_parts: 'Waiting Parts',
  completed: 'Completed',
  cancelled: 'Cancelled',
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  no_show: 'No Show',
  paid: 'Paid',
  overdue: 'Overdue',
};

export function StatusChip({ status, size = 'default' }: StatusChipProps) {
  const color = STATUS_COLORS[status as StatusColor] || '#9ca3af';
  const label = LABELS[status] || status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <Chip
      mode="flat"
      compact={size === 'small'}
      style={{ backgroundColor: color + '20', alignSelf: 'flex-start' }}
      textStyle={{ color, fontSize: size === 'small' ? 11 : 13, fontWeight: '600' }}
    >
      {label}
    </Chip>
  );
}
