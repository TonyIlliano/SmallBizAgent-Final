import { MD3LightTheme, configureFonts } from 'react-native-paper';

export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#663399',
    primaryContainer: '#e8daf5',
    secondary: '#f59e0b',
    secondaryContainer: '#fef3c7',
    background: '#f8f9fa',
    surface: '#ffffff',
    error: '#ef4444',
    onPrimary: '#ffffff',
    onBackground: '#1a1a2e',
    onSurface: '#1a1a2e',
    outline: '#e2e8f0',
  },
  roundness: 12,
};

// Status colors matching the web app
export const STATUS_COLORS = {
  pending: '#9ca3af',
  in_progress: '#3b82f6',
  waiting_parts: '#f59e0b',
  completed: '#22c55e',
  cancelled: '#ef4444',
  scheduled: '#6366f1',
  confirmed: '#3b82f6',
  no_show: '#ef4444',
  paid: '#22c55e',
  overdue: '#ef4444',
} as const;

export type StatusColor = keyof typeof STATUS_COLORS;
