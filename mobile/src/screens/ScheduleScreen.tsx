import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  Animated,
} from 'react-native';
import { Text, Divider } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getAppointments, Appointment } from '../api/appointments';
import { getJobs, Job } from '../api/jobs';
import { apiRequest } from '../api/client';
import { StatusChip } from '../components/StatusChip';
import { theme, STATUS_COLORS } from '../theme';
import type { ScheduleStackParamList } from '../navigation/types';

// ─── Constants ──────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get('window').width;
const HOUR_HEIGHT = 72; // pixels per hour row
const TIME_GUTTER_WIDTH = 52;
const GRID_LEFT_PADDING = 4;

const STAFF_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];
const UNASSIGNED_COLOR = '#9ca3af';

// Native status colors (hex values for React Native)
const NATIVE_STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  scheduled: { bg: '#eff6ff', border: '#3b82f6', text: '#1d4ed8' },
  confirmed: { bg: '#f0fdf4', border: '#22c55e', text: '#15803d' },
  completed: { bg: '#faf5ff', border: '#a855f7', text: '#7e22ce' },
  cancelled: { bg: '#fef2f2', border: '#ef4444', text: '#b91c1c' },
  no_show:   { bg: '#fffbeb', border: '#f59e0b', text: '#b45309' },
  pending:   { bg: '#f9fafb', border: '#9ca3af', text: '#4b5563' },
  in_progress: { bg: '#eff6ff', border: '#3b82f6', text: '#1d4ed8' },
  waiting_parts: { bg: '#fffbeb', border: '#f59e0b', text: '#b45309' },
};

function getStatusColor(status: string) {
  return NATIVE_STATUS_COLORS[status] || NATIVE_STATUS_COLORS.pending;
}

// ─── Utility Functions ──────────────────────────────────────────────────

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

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDateHeader(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const prefix = isToday(date) ? 'Today' : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
  return `${prefix}, ${months[date.getMonth()]} ${date.getDate()}`;
}

function formatTime12(dateStr: string): string {
  const date = new Date(dateStr);
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return minutes === 0 ? `${hours} ${ampm}` : `${hours}:${String(minutes).padStart(2, '0')} ${ampm}`;
}

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

function formatHourShort(hour: number): string {
  if (hour === 0) return '12a';
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return '12p';
  return `${hour - 12}p`;
}

function getWeekDates(date: Date): Date[] {
  const start = new Date(date);
  const day = start.getDay();
  start.setDate(start.getDate() - day); // Start from Sunday
  const week: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    week.push(d);
  }
  return week;
}

function getShortDay(date: Date): string {
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][date.getDay()];
}

function getStaffColor(staffId: number | null | undefined, staffList: Array<{ id: number }>): string {
  if (!staffId) return UNASSIGNED_COLOR;
  const index = staffList.findIndex((s) => s.id === staffId);
  if (index === -1) return UNASSIGNED_COLOR;
  return STAFF_COLORS[index % STAFF_COLORS.length];
}

/** Compute calendar range from business hours, fallback 8-18 */
function computeCalendarRange(businessHours: Array<{ day: string; open: string | null; close: string | null; isClosed: boolean }> | undefined): { hourStart: number; hourEnd: number; hours: number[] } {
  if (!businessHours || businessHours.length === 0) {
    const hours = Array.from({ length: 11 }, (_, i) => 8 + i); // 8 AM to 6 PM
    return { hourStart: 8, hourEnd: 18, hours };
  }

  const openDays = businessHours.filter(h => !h.isClosed && h.open && h.close);
  if (openDays.length === 0) {
    const hours = Array.from({ length: 11 }, (_, i) => 8 + i);
    return { hourStart: 8, hourEnd: 18, hours };
  }

  let minOpen = 24;
  let maxClose = 0;
  for (const day of openDays) {
    const openHour = parseInt(day.open!.split(':')[0], 10);
    const closeHour = parseInt(day.close!.split(':')[0], 10);
    const closeMin = parseInt(day.close!.split(':')[1], 10);
    if (openHour < minOpen) minOpen = openHour;
    const effectiveClose = closeMin > 0 ? closeHour + 1 : closeHour;
    if (effectiveClose > maxClose) maxClose = effectiveClose;
  }

  const hourStart = Math.max(6, minOpen - 1);
  const hourEnd = Math.min(23, maxClose + 1);
  const hours = Array.from({ length: hourEnd - hourStart + 1 }, (_, i) => hourStart + i);
  return { hourStart, hourEnd, hours };
}

// ─── Types ──────────────────────────────────────────────────────────────

type ScheduleNavProp = NativeStackNavigationProp<ScheduleStackParamList, 'ScheduleList'>;

interface StaffMember {
  id: number;
  firstName: string;
  lastName: string;
  specialty?: string | null;
}

// ─── Component ──────────────────────────────────────────────────────────

export default function ScheduleScreen() {
  const navigation = useNavigation<ScheduleNavProp>();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [visibleStaff, setVisibleStaff] = useState<Set<number>>(new Set()); // empty = all visible
  const [refreshing, setRefreshing] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const dateStr = toDateString(selectedDate);

  // Pulse animation for active-now indicator
  React.useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // ─── Data Fetching ──────────────────────────────────────────────────

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

  const {
    data: staffMembers,
  } = useQuery<StaffMember[]>({
    queryKey: ['staff'],
    queryFn: () => apiRequest('GET', '/api/staff'),
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: businessHours,
  } = useQuery<Array<{ day: string; open: string | null; close: string | null; isClosed: boolean }>>({
    queryKey: ['business-hours'],
    queryFn: () => apiRequest('GET', '/api/business/hours'),
    staleTime: 10 * 60 * 1000,
  });

  const isLoading = appointmentsLoading || jobsLoading;

  // ─── Calendar Range ─────────────────────────────────────────────────

  const calendarRange = useMemo(() => computeCalendarRange(businessHours), [businessHours]);

  // ─── Staff List ─────────────────────────────────────────────────────

  const staffList = useMemo(() => staffMembers || [], [staffMembers]);

  // ─── Stats Computation ──────────────────────────────────────────────

  const stats = useMemo(() => {
    const appts = appointments || [];
    const now = new Date();

    const booked = appts.filter(a => a.status !== 'cancelled').length;

    const earned = appts
      .filter(a => a.status === 'completed')
      .reduce((sum, a) => sum + parseFloat(String(a.service?.price || '0')), 0);

    const activeNow = appts.filter(a => {
      if (a.status === 'cancelled' || a.status === 'no_show') return false;
      const start = new Date(a.startDate);
      const end = new Date(a.endDate);
      return start <= now && now <= end;
    }).length;

    const noShows = appts.filter(a => a.status === 'no_show').length;

    return { booked, earned, activeNow, noShows };
  }, [appointments]);

  // ─── Staff Filter ───────────────────────────────────────────────────

  // Unique staff from today's appointments
  const staffWithCounts = useMemo(() => {
    const appts = appointments || [];
    const counts = new Map<number, number>();
    for (const appt of appts) {
      if (appt.staffId && appt.status !== 'cancelled') {
        counts.set(appt.staffId, (counts.get(appt.staffId) || 0) + 1);
      }
    }
    return staffList
      .filter(s => counts.has(s.id))
      .map(s => ({
        ...s,
        count: counts.get(s.id) || 0,
        color: getStaffColor(s.id, staffList),
      }));
  }, [appointments, staffList]);

  const toggleStaffFilter = useCallback((staffId: number) => {
    setVisibleStaff(prev => {
      const next = new Set(prev);
      if (next.has(staffId)) {
        next.delete(staffId);
      } else {
        next.add(staffId);
      }
      return next;
    });
  }, []);

  // ─── Filtered Appointments ──────────────────────────────────────────

  const filteredAppointments = useMemo(() => {
    const appts = appointments || [];
    if (visibleStaff.size === 0) return appts; // no filter = show all
    return appts.filter(a => a.staffId && visibleStaff.has(a.staffId));
  }, [appointments, visibleStaff]);

  // ─── Day View: Position appointments on time grid ───────────────────

  const dayAppointments = useMemo(() => {
    return filteredAppointments
      .filter(a => a.status !== 'cancelled')
      .map(appt => {
        const start = new Date(appt.startDate);
        const end = new Date(appt.endDate);
        const startHour = start.getHours() + start.getMinutes() / 60;
        const endHour = end.getHours() + end.getMinutes() / 60;
        const duration = Math.max(endHour - startHour, 0.25); // min 15 min height
        const topOffset = (startHour - calendarRange.hourStart) * HOUR_HEIGHT;
        const height = duration * HOUR_HEIGHT;
        const staffColor = getStaffColor(appt.staffId, staffList);
        const statusColor = getStatusColor(appt.status);

        return {
          ...appt,
          topOffset,
          height: Math.max(height, 36), // Minimum card height
          staffColor,
          statusColor,
          startHour,
          formattedTime: formatTime12(appt.startDate),
          customerFirstName: appt.customer?.firstName || 'Unknown',
          serviceName: appt.service?.name || 'Appointment',
        };
      })
      .sort((a, b) => a.startHour - b.startHour);
  }, [filteredAppointments, calendarRange.hourStart, staffList]);

  // ─── Week View Data ─────────────────────────────────────────────────

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);

  // For week view we need appointments for the whole week
  // We use the currently loaded day appointments + jobs
  const weekAppointments = useMemo(() => {
    if (viewMode !== 'week') return [];
    const appts = filteredAppointments || [];
    return weekDates.map(date => {
      const ds = toDateString(date);
      const dayAppts = appts.filter(a => a.startDate.slice(0, 10) === ds && a.status !== 'cancelled');
      // Also include jobs for this date
      const dayJobs = (jobs || []).filter(j => j.scheduledDate && j.scheduledDate.slice(0, 10) === ds);
      return {
        date,
        dateStr: ds,
        appointments: dayAppts,
        jobs: dayJobs,
        totalCount: dayAppts.length + dayJobs.length,
      };
    });
  }, [viewMode, weekDates, filteredAppointments, jobs]);

  // ─── Navigation ─────────────────────────────────────────────────────

  const navigateDate = useCallback((direction: -1 | 1) => {
    setSelectedDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() + (viewMode === 'week' ? direction * 7 : direction));
      return next;
    });
  }, [viewMode]);

  const goToToday = useCallback(() => {
    setSelectedDate(new Date());
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchAppointments(), refetchJobs()]);
    setRefreshing(false);
  }, [refetchAppointments, refetchJobs]);

  const handleAppointmentPress = useCallback((appointmentId: number) => {
    navigation.navigate('AppointmentDetail', { appointmentId });
  }, [navigation]);

  // ─── Current Time Indicator ─────────────────────────────────────────

  const nowIndicator = useMemo(() => {
    if (!isToday(selectedDate)) return null;
    const now = new Date();
    const nowHour = now.getHours() + now.getMinutes() / 60;
    if (nowHour < calendarRange.hourStart || nowHour > calendarRange.hourEnd) return null;
    return (nowHour - calendarRange.hourStart) * HOUR_HEIGHT;
  }, [selectedDate, calendarRange]);

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* ── Date Header ────────────────────────────────────────────── */}
      <View style={styles.dateHeader}>
        <TouchableOpacity onPress={() => navigateDate(-1)} style={styles.navButton} activeOpacity={0.6}>
          <Text style={styles.navChevron}>{'<'}</Text>
        </TouchableOpacity>

        <View style={styles.dateCenter}>
          <Text style={styles.dateLabel}>{formatDateHeader(selectedDate)}</Text>
        </View>

        <TouchableOpacity onPress={() => navigateDate(1)} style={styles.navButton} activeOpacity={0.6}>
          <Text style={styles.navChevron}>{'>'}</Text>
        </TouchableOpacity>

        {/* View Toggle */}
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'day' && styles.toggleButtonActive]}
            onPress={() => setViewMode('day')}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleText, viewMode === 'day' && styles.toggleTextActive]}>Day</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'week' && styles.toggleButtonActive]}
            onPress={() => setViewMode('week')}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleText, viewMode === 'week' && styles.toggleTextActive]}>Week</Text>
          </TouchableOpacity>
        </View>

        {/* Today button when not viewing today */}
        {!isToday(selectedDate) && (
          <TouchableOpacity onPress={goToToday} style={styles.todayButton} activeOpacity={0.7}>
            <Text style={styles.todayButtonText}>Today</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Stats Row ──────────────────────────────────────────────── */}
      <View style={styles.statsRow}>
        <View style={styles.statChip}>
          <Text style={styles.statIcon}>{'📅'}</Text>
          <View>
            <Text style={styles.statValue}>{stats.booked}</Text>
            <Text style={styles.statLabel}>Booked</Text>
          </View>
        </View>

        <View style={[styles.statChip, stats.activeNow > 0 && styles.statChipActive]}>
          <Animated.View style={{ opacity: stats.activeNow > 0 ? pulseAnim : 1 }}>
            <Text style={styles.statIcon}>{'⚡'}</Text>
          </Animated.View>
          <View>
            <Text style={[styles.statValue, stats.activeNow > 0 && { color: '#22c55e' }]}>{stats.activeNow}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
        </View>

        <View style={styles.statChip}>
          <Text style={styles.statIcon}>{'💰'}</Text>
          <View>
            <Text style={[styles.statValue, stats.earned > 0 && { color: '#15803d' }]}>
              ${stats.earned.toFixed(0)}
            </Text>
            <Text style={styles.statLabel}>Earned</Text>
          </View>
        </View>

        <View style={styles.statChip}>
          <Text style={styles.statIcon}>{'🚫'}</Text>
          <View>
            <Text style={[styles.statValue, stats.noShows > 0 && { color: '#ef4444' }]}>{stats.noShows}</Text>
            <Text style={styles.statLabel}>No-show</Text>
          </View>
        </View>
      </View>

      {/* ── Staff Filter Pills ─────────────────────────────────────── */}
      {staffWithCounts.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.staffPillsContainer}
          style={styles.staffPillsScroll}
        >
          {staffWithCounts.map(staff => {
            const isActive = visibleStaff.size === 0 || visibleStaff.has(staff.id);
            return (
              <TouchableOpacity
                key={staff.id}
                style={[
                  styles.staffPill,
                  { borderColor: staff.color },
                  isActive && { backgroundColor: staff.color + '18' },
                  !isActive && { opacity: 0.4 },
                ]}
                onPress={() => toggleStaffFilter(staff.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.staffDot, { backgroundColor: staff.color }]} />
                <Text style={[styles.staffPillText, { color: isActive ? '#171717' : '#9ca3af' }]} numberOfLines={1}>
                  {staff.firstName}
                </Text>
                <View style={[styles.staffCountBadge, { backgroundColor: staff.color + '30' }]}>
                  <Text style={[styles.staffCountText, { color: staff.color }]}>{staff.count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <Divider />

      {/* ── DAY VIEW (Time Grid) ───────────────────────────────────── */}
      {viewMode === 'day' && (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.dayScrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {!isLoading && filteredAppointments.length === 0 ? (
            /* Empty State */
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>{'📅'}</Text>
              <Text style={styles.emptyTitle}>No appointments today</Text>
              <Text style={styles.emptySubtitle}>
                {isToday(selectedDate)
                  ? 'Your schedule is clear for today'
                  : `Nothing scheduled for ${formatDateHeader(selectedDate)}`}
              </Text>
            </View>
          ) : (
            /* Time Grid */
            <View style={[styles.timeGrid, { height: calendarRange.hours.length * HOUR_HEIGHT }]}>
              {/* Hour rows */}
              {calendarRange.hours.map((hour, index) => (
                <View key={hour} style={[styles.hourRow, { top: index * HOUR_HEIGHT }]}>
                  <View style={styles.hourLabel}>
                    <Text style={styles.hourText}>{formatHourShort(hour)}</Text>
                  </View>
                  <View style={styles.hourLine} />
                </View>
              ))}

              {/* Half-hour lines */}
              {calendarRange.hours.map((hour, index) => (
                <View
                  key={`half-${hour}`}
                  style={[
                    styles.halfHourLine,
                    { top: index * HOUR_HEIGHT + HOUR_HEIGHT / 2 },
                  ]}
                />
              ))}

              {/* Current time indicator */}
              {nowIndicator !== null && (
                <View style={[styles.nowIndicatorContainer, { top: nowIndicator }]}>
                  <View style={styles.nowDot} />
                  <View style={styles.nowLine} />
                </View>
              )}

              {/* Appointment cards */}
              {dayAppointments.map(appt => (
                <TouchableOpacity
                  key={appt.id}
                  style={[
                    styles.appointmentCard,
                    {
                      top: appt.topOffset,
                      height: appt.height,
                      left: TIME_GUTTER_WIDTH + GRID_LEFT_PADDING + 4,
                      right: 12,
                      borderLeftColor: appt.staffColor,
                      backgroundColor: appt.statusColor.bg,
                    },
                  ]}
                  onPress={() => handleAppointmentPress(appt.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.appointmentCardContent}>
                    <View style={styles.appointmentCardHeader}>
                      <Text style={[styles.appointmentCustomerName, { color: appt.statusColor.text }]} numberOfLines={1}>
                        {appt.customerFirstName}
                      </Text>
                      <Text style={styles.appointmentTime}>{appt.formattedTime}</Text>
                    </View>
                    {appt.height > 44 && (
                      <Text style={styles.appointmentService} numberOfLines={1}>
                        {appt.serviceName}
                      </Text>
                    )}
                    {appt.height > 60 && appt.staff && (
                      <View style={styles.appointmentStaffRow}>
                        <View style={[styles.miniStaffDot, { backgroundColor: appt.staffColor }]} />
                        <Text style={styles.appointmentStaffName} numberOfLines={1}>
                          {appt.staff.firstName}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ── WEEK VIEW ──────────────────────────────────────────────── */}
      {viewMode === 'week' && (
        <ScrollView
          style={styles.flex}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Week Day Strip */}
          <View style={styles.weekStrip}>
            {weekDates.map(d => {
              const ds = toDateString(d);
              const isSel = isSameDay(d, selectedDate);
              const isTod = isToday(d);
              const dayData = weekAppointments.find(w => w.dateStr === ds);
              const count = dayData?.totalCount || 0;

              return (
                <TouchableOpacity
                  key={ds}
                  style={[
                    styles.weekDayCell,
                    isSel && styles.weekDayCellSelected,
                    isTod && !isSel && styles.weekDayCellToday,
                  ]}
                  onPress={() => {
                    setSelectedDate(d);
                    setViewMode('day');
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.weekDayLabel,
                      isTod && { color: '#22c55e' },
                      isSel && { color: '#ffffff' },
                    ]}
                  >
                    {getShortDay(d)}
                  </Text>
                  <Text
                    style={[
                      styles.weekDayNumber,
                      isTod && { color: '#22c55e', fontWeight: '700' },
                      isSel && { color: '#ffffff', fontWeight: '700' },
                    ]}
                  >
                    {d.getDate()}
                  </Text>
                  {count > 0 && !isSel && (
                    <View style={[styles.weekDayDot, isTod && { backgroundColor: '#22c55e' }]} />
                  )}
                  {count > 0 && isSel && (
                    <Text style={styles.weekDayCount}>{count}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <Divider />

          {/* Week Day List */}
          <View style={styles.weekListContainer}>
            {weekAppointments.map(dayData => {
              if (dayData.totalCount === 0) return null;

              return (
                <View key={dayData.dateStr} style={styles.weekDaySection}>
                  {/* Day header */}
                  <View style={styles.weekDayHeader}>
                    <Text style={[styles.weekDayHeaderText, isToday(dayData.date) && { color: '#22c55e' }]}>
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayData.date.getDay()]} {dayData.date.getDate()}
                    </Text>
                    {isToday(dayData.date) && (
                      <View style={styles.todayBadge}>
                        <Text style={styles.todayBadgeText}>TODAY</Text>
                      </View>
                    )}
                    <Text style={styles.weekDayItemCount}>
                      {dayData.totalCount} item{dayData.totalCount !== 1 ? 's' : ''}
                    </Text>
                  </View>

                  {/* Appointments */}
                  {dayData.appointments.map(appt => {
                    const statusColor = getStatusColor(appt.status);
                    const staffColor = getStaffColor(appt.staffId, staffList);
                    return (
                      <TouchableOpacity
                        key={`appt-${appt.id}`}
                        style={styles.weekItem}
                        onPress={() => handleAppointmentPress(appt.id)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.weekItemBorder, { backgroundColor: staffColor }]} />
                        <Text style={styles.weekItemTime}>{formatTime12(appt.startDate)}</Text>
                        <View style={styles.weekItemDetails}>
                          <Text style={styles.weekItemTitle} numberOfLines={1}>
                            {appt.customer ? appt.customer.firstName : 'Unknown'}
                          </Text>
                          <Text style={styles.weekItemSubtitle} numberOfLines={1}>
                            {appt.service?.name || 'Appointment'}
                          </Text>
                        </View>
                        <StatusChip status={appt.status} size="small" />
                      </TouchableOpacity>
                    );
                  })}

                  {/* Jobs */}
                  {dayData.jobs.map(job => {
                    const statusColor = getStatusColor(job.status);
                    return (
                      <View key={`job-${job.id}`} style={styles.weekItem}>
                        <View style={[styles.weekItemBorder, { backgroundColor: '#6366f1' }]} />
                        <Text style={styles.weekItemTime}>
                          {job.scheduledDate ? formatTime12(job.scheduledDate) : '--'}
                        </Text>
                        <View style={styles.weekItemDetails}>
                          <Text style={styles.weekItemTitle} numberOfLines={1}>{job.title}</Text>
                          <Text style={styles.weekItemSubtitle} numberOfLines={1}>
                            {job.customer ? `${job.customer.firstName} ${job.customer.lastName}` : 'Job'}
                          </Text>
                        </View>
                        <StatusChip status={job.status} size="small" />
                      </View>
                    );
                  })}
                </View>
              );
            })}

            {/* Empty week */}
            {weekAppointments.every(d => d.totalCount === 0) && !isLoading && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>{'📅'}</Text>
                <Text style={styles.emptyTitle}>No appointments this week</Text>
                <Text style={styles.emptySubtitle}>Your schedule is clear</Text>
              </View>
            )}
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: {
    flex: 1,
  },

  // ── Date Header ──────────────────────────────────────────────────
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    gap: 4,
  },
  navButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navChevron: {
    fontSize: 16,
    fontWeight: '700',
    color: '#171717',
  },
  dateCenter: {
    flex: 1,
    alignItems: 'center',
  },
  dateLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#171717',
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 2,
  },
  toggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  toggleButtonActive: {
    backgroundColor: '#171717',
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  toggleTextActive: {
    color: '#ffffff',
  },
  todayButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#22c55e15',
  },
  todayButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#22c55e',
  },

  // ── Stats Row ────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    backgroundColor: '#ffffff',
  },
  statChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  statChipActive: {
    borderColor: '#22c55e30',
    backgroundColor: '#f0fdf4',
  },
  statIcon: {
    fontSize: 14,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#171717',
    lineHeight: 18,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    lineHeight: 12,
  },

  // ── Staff Pills ──────────────────────────────────────────────────
  staffPillsScroll: {
    backgroundColor: '#ffffff',
    maxHeight: 44,
  },
  staffPillsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  staffPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  staffDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  staffPillText: {
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 80,
  },
  staffCountBadge: {
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  staffCountText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // ── Day View: Time Grid ──────────────────────────────────────────
  dayScrollContent: {
    paddingBottom: 16,
  },
  timeGrid: {
    position: 'relative',
    marginTop: 8,
  },
  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: HOUR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  hourLabel: {
    width: TIME_GUTTER_WIDTH,
    paddingRight: 8,
    alignItems: 'flex-end',
  },
  hourText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#9ca3af',
    marginTop: -6,
  },
  hourLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#f3f4f6',
  },
  halfHourLine: {
    position: 'absolute',
    left: TIME_GUTTER_WIDTH,
    right: 0,
    height: 1,
    backgroundColor: '#f9fafb',
  },

  // ── Current Time Indicator ───────────────────────────────────────
  nowIndicatorContainer: {
    position: 'absolute',
    left: TIME_GUTTER_WIDTH - 4,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 20,
  },
  nowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  nowLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#ef4444',
  },

  // ── Appointment Card (Day View) ──────────────────────────────────
  appointmentCard: {
    position: 'absolute',
    borderRadius: 8,
    borderLeftWidth: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  appointmentCardContent: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  appointmentCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  appointmentCustomerName: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  appointmentTime: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6b7280',
  },
  appointmentService: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 1,
  },
  appointmentStaffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  miniStaffDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  appointmentStaffName: {
    fontSize: 10,
    color: '#9ca3af',
    fontWeight: '500',
  },

  // ── Week View ────────────────────────────────────────────────────
  weekStrip: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    gap: 2,
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
  },
  weekDayCellSelected: {
    backgroundColor: '#171717',
  },
  weekDayCellToday: {
    backgroundColor: '#22c55e10',
  },
  weekDayLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
    marginBottom: 2,
  },
  weekDayNumber: {
    fontSize: 16,
    fontWeight: '500',
    color: '#171717',
  },
  weekDayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#171717',
    marginTop: 4,
  },
  weekDayCount: {
    fontSize: 9,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 2,
  },
  weekListContainer: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  weekDaySection: {
    marginBottom: 16,
  },
  weekDayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  weekDayHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#171717',
  },
  todayBadge: {
    backgroundColor: '#22c55e',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  todayBadgeText: {
    fontSize: 9,
    color: '#ffffff',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  weekDayItemCount: {
    fontSize: 12,
    color: '#9ca3af',
    marginLeft: 'auto',
  },
  weekItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    marginBottom: 4,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  weekItemBorder: {
    width: 3,
    height: '80%',
    borderRadius: 2,
  },
  weekItemTime: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    width: 64,
  },
  weekItemDetails: {
    flex: 1,
  },
  weekItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#171717',
  },
  weekItemSubtitle: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 1,
  },

  // ── Empty State ──────────────────────────────────────────────────
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
    color: '#171717',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 8,
  },
});
