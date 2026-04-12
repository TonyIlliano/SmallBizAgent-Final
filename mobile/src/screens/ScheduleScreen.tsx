import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Text, Card, IconButton, FAB, Divider } from 'react-native-paper';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAppointments, Appointment } from '../api/appointments';
import { getJobs, Job } from '../api/jobs';
import { StatusChip } from '../components/StatusChip';
import { theme } from '../theme';

interface TimelineItem {
  id: string;
  type: 'appointment' | 'job';
  time: string;
  endTime?: string;
  title: string;
  customerName: string;
  status: string;
  raw: Appointment | Job;
}

function formatDate(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function getWeekDates(date: Date): Date[] {
  const start = new Date(date);
  const day = start.getDay();
  start.setDate(start.getDate() - day); // Sunday
  const week: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    week.push(d);
  }
  return week;
}

function getShortDay(date: Date): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
}

export default function ScheduleScreen() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const dateStr = toDateString(selectedDate);

  const {
    data: appointments,
    isLoading: appointmentsLoading,
    refetch: refetchAppointments,
  } = useQuery({
    queryKey: ['appointments', dateStr],
    queryFn: () => getAppointments(dateStr),
  });

  const {
    data: jobs,
    isLoading: jobsLoading,
    refetch: refetchJobs,
  } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => getJobs(),
  });

  const isLoading = appointmentsLoading || jobsLoading;

  const timeline = useMemo((): TimelineItem[] => {
    const items: TimelineItem[] = [];

    // Add appointments
    if (appointments) {
      for (const appt of appointments) {
        const customerName = appt.customer
          ? `${appt.customer.firstName} ${appt.customer.lastName}`
          : 'Unknown Customer';
        const title = appt.service?.name || 'Appointment';
        items.push({
          id: `appt-${appt.id}`,
          type: 'appointment',
          time: formatTime(appt.startDate),
          endTime: formatTime(appt.endDate),
          title,
          customerName,
          status: appt.status,
          raw: appt,
        });
      }
    }

    // Add jobs scheduled for this date
    if (jobs) {
      for (const job of jobs) {
        if (!job.scheduledDate) continue;
        const jobDate = job.scheduledDate.slice(0, 10);
        if (jobDate !== dateStr) continue;

        const customerName = job.customer
          ? `${job.customer.firstName} ${job.customer.lastName}`
          : 'Unknown Customer';
        items.push({
          id: `job-${job.id}`,
          type: 'job',
          time: formatTime(job.scheduledDate),
          title: job.title,
          customerName,
          status: job.status,
          raw: job,
        });
      }
    }

    // Sort by time string
    items.sort((a, b) => a.time.localeCompare(b.time));
    return items;
  }, [appointments, jobs, dateStr]);

  const navigateDate = useCallback((direction: -1 | 1) => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + (viewMode === 'week' ? direction * 7 : direction));
      return next;
    });
  }, [viewMode]);

  // Week view data: group items by day
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const weekData = useMemo(() => {
    if (viewMode !== 'week') return [];
    return weekDates.map((date) => {
      const ds = toDateString(date);
      const dayItems: TimelineItem[] = [];

      if (appointments) {
        for (const appt of appointments) {
          const apptDate = appt.startDate.slice(0, 10);
          if (apptDate === ds) {
            dayItems.push({
              id: `appt-${appt.id}`,
              type: 'appointment',
              time: formatTime(appt.startDate),
              endTime: formatTime(appt.endDate),
              title: appt.service?.name || 'Appointment',
              customerName: appt.customer ? `${appt.customer.firstName} ${appt.customer.lastName}` : 'Unknown',
              status: appt.status,
              raw: appt,
            });
          }
        }
      }
      if (jobs) {
        for (const job of jobs) {
          if (!job.scheduledDate) continue;
          if (job.scheduledDate.slice(0, 10) === ds) {
            dayItems.push({
              id: `job-${job.id}`,
              type: 'job',
              time: formatTime(job.scheduledDate),
              title: job.title,
              customerName: job.customer ? `${job.customer.firstName} ${job.customer.lastName}` : 'Unknown',
              status: job.status,
              raw: job,
            });
          }
        }
      }
      dayItems.sort((a, b) => a.time.localeCompare(b.time));
      return { date, dateStr: ds, items: dayItems };
    });
  }, [viewMode, weekDates, appointments, jobs]);

  const onRefresh = useCallback(async () => {
    await Promise.all([refetchAppointments(), refetchJobs()]);
  }, [refetchAppointments, refetchJobs]);

  const goToToday = useCallback(() => {
    setSelectedDate(new Date());
  }, []);

  return (
    <View style={styles.container}>
      {/* Date Header */}
      <View style={styles.dateHeader}>
        <IconButton
          icon="chevron-left"
          size={24}
          onPress={() => navigateDate(-1)}
          iconColor={theme.colors.onBackground}
        />
        <View style={styles.dateCenter}>
          <Text style={styles.dateLabel}>
            {isToday(selectedDate) ? 'Today' : formatDate(selectedDate)}
          </Text>
          <Text style={styles.dateSubLabel}>
            {isToday(selectedDate) ? formatDate(selectedDate) : ''}
          </Text>
        </View>
        <IconButton
          icon="chevron-right"
          size={24}
          onPress={() => navigateDate(1)}
          iconColor={theme.colors.onBackground}
        />
        {!isToday(selectedDate) && (
          <IconButton
            icon="calendar-today"
            size={20}
            onPress={goToToday}
            iconColor={theme.colors.primary}
          />
        )}
      </View>

      {/* Day/Week Toggle */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
        <IconButton
          icon="view-day"
          size={20}
          mode={viewMode === 'day' ? 'contained' : 'outlined'}
          onPress={() => setViewMode('day')}
          iconColor={viewMode === 'day' ? '#ffffff' : theme.colors.primary}
          containerColor={viewMode === 'day' ? theme.colors.primary : undefined}
          style={{ margin: 0 }}
        />
        <IconButton
          icon="view-week"
          size={20}
          mode={viewMode === 'week' ? 'contained' : 'outlined'}
          onPress={() => setViewMode('week')}
          iconColor={viewMode === 'week' ? '#ffffff' : theme.colors.primary}
          containerColor={viewMode === 'week' ? theme.colors.primary : undefined}
          style={{ margin: 0 }}
        />
      </View>

      {/* Week Day Strip (week view only) */}
      {viewMode === 'week' && (
        <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 8, gap: 2 }}>
          {weekDates.map((d) => {
            const ds = toDateString(d);
            const isSel = ds === dateStr;
            const isTod = isToday(d);
            return (
              <View
                key={ds}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: isSel ? theme.colors.primary + '15' : 'transparent',
                }}
              >
                <Text style={{ fontSize: 11, color: isTod ? theme.colors.primary : '#9ca3af', fontWeight: '600' }}>
                  {getShortDay(d)}
                </Text>
                <Text style={{ fontSize: 16, fontWeight: isSel ? '700' : '500', color: isTod ? theme.colors.primary : theme.colors.onBackground }}>
                  {d.getDate()}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <Divider />

      {/* Timeline */}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* WEEK VIEW */}
        {viewMode === 'week' && weekData.map((dayData) => (
          <View key={dayData.dateStr} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: isToday(dayData.date) ? theme.colors.primary : theme.colors.onBackground }}>
                {getShortDay(dayData.date)} {dayData.date.getDate()}
              </Text>
              {isToday(dayData.date) && (
                <View style={{ backgroundColor: theme.colors.primary, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 10, color: '#ffffff', fontWeight: '600' }}>TODAY</Text>
                </View>
              )}
              <Text style={{ fontSize: 12, color: '#9ca3af' }}>{dayData.items.length} item{dayData.items.length !== 1 ? 's' : ''}</Text>
            </View>
            {dayData.items.length === 0 ? (
              <Text style={{ fontSize: 13, color: '#d1d5db', paddingLeft: 8, marginBottom: 4 }}>No items</Text>
            ) : (
              dayData.items.map((item) => (
                <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingLeft: 8, gap: 8 }}>
                  <Text style={{ fontSize: 12, color: '#6b7280', width: 60 }}>{item.time}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: theme.colors.onBackground }} numberOfLines={1}>{item.title}</Text>
                    <Text style={{ fontSize: 11, color: '#9ca3af' }}>{item.customerName}</Text>
                  </View>
                  <StatusChip status={item.status} size="small" />
                </View>
              ))
            )}
            <Divider style={{ marginTop: 4 }} />
          </View>
        ))}

        {/* DAY VIEW */}
        {viewMode === 'day' && !isLoading && timeline.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>
              {'\uD83D\uDCC5'}
            </Text>
            <Text style={styles.emptyTitle}>No appointments or jobs today</Text>
            <Text style={styles.emptySubtitle}>
              {isToday(selectedDate)
                ? 'Your schedule is clear for today'
                : `Nothing scheduled for ${formatDate(selectedDate)}`}
            </Text>
          </View>
        )}

        {viewMode === 'day' && timeline.map((item, index) => (
          <Card key={item.id} style={styles.timelineCard} mode="elevated">
            <View style={styles.cardContent}>
              {/* Time Column */}
              <View style={styles.timeColumn}>
                <Text style={styles.timeText}>{item.time}</Text>
                {item.endTime && (
                  <Text style={styles.endTimeText}>{item.endTime}</Text>
                )}
              </View>

              {/* Divider Dot */}
              <View style={styles.dotColumn}>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        item.type === 'appointment'
                          ? theme.colors.primary
                          : '#3b82f6',
                    },
                  ]}
                />
                {index < timeline.length - 1 && (
                  <View style={styles.dotLine} />
                )}
              </View>

              {/* Details Column */}
              <View style={styles.detailsColumn}>
                <View style={styles.detailsHeader}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <StatusChip status={item.status} size="small" />
                </View>
                <Text style={styles.customerName} numberOfLines={1}>
                  {item.customerName}
                </Text>
                <Text style={styles.itemType}>
                  {item.type === 'appointment' ? 'Appointment' : 'Job'}
                </Text>
              </View>
            </View>
          </Card>
        ))}

        {/* Bottom padding for FAB */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* FAB */}
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => {
          // Placeholder for future "quick add" functionality
        }}
        color="#ffffff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 12,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#ffffff',
  },
  dateCenter: {
    flex: 1,
    alignItems: 'center',
  },
  dateLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.onBackground,
  },
  dateSubLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.onBackground,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
  timelineCard: {
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  cardContent: {
    flexDirection: 'row',
    padding: 16,
  },
  timeColumn: {
    width: 60,
    alignItems: 'flex-end',
    paddingRight: 12,
    paddingTop: 2,
  },
  timeText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.onBackground,
  },
  endTimeText: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  dotColumn: {
    width: 20,
    alignItems: 'center',
    paddingTop: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#e5e7eb',
    marginTop: 4,
  },
  detailsColumn: {
    flex: 1,
    paddingLeft: 12,
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.onBackground,
    flex: 1,
  },
  customerName: {
    fontSize: 14,
    color: '#4b5563',
    marginTop: 4,
  },
  itemType: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
  },
});
