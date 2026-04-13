import { MD3LightTheme, configureFonts } from 'react-native-paper';

// Theme matching the web app: dark neutrals with green accents
export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#171717',        // Near-black (matches web --primary)
    primaryContainer: '#f5f5f5',
    secondary: '#22c55e',      // Green accent (matches web green-500)
    secondaryContainer: '#dcfce7',
    tertiary: '#3b82f6',       // Blue for info states
    background: '#fafafa',
    surface: '#ffffff',
    surfaceVariant: '#f5f5f5',
    error: '#ef4444',
    onPrimary: '#ffffff',
    onBackground: '#171717',
    onSurface: '#171717',
    onSurfaceVariant: '#6b7280',
    outline: '#e5e7eb',
    outlineVariant: '#f3f4f6',
    elevation: {
      level0: 'transparent',
      level1: '#ffffff',
      level2: '#fafafa',
      level3: '#f5f5f5',
      level4: '#f0f0f0',
      level5: '#e5e5e5',
    },
  },
  roundness: 10,
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
