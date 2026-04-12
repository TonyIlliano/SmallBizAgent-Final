import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';
import {
  TabParamList,
  ScheduleStackParamList,
  JobsStackParamList,
  CustomersStackParamList,
  MoreStackParamList,
} from './types';

// Screens
import DashboardScreen from '../screens/DashboardScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import AppointmentDetailScreen from '../screens/AppointmentDetailScreen';
import JobsScreen from '../screens/JobsScreen';
import JobDetailScreen from '../screens/JobDetailScreen';
import QuickInvoiceScreen from '../screens/QuickInvoiceScreen';
import CustomerListScreen from '../screens/CustomerListScreen';
import CustomerDetailScreen from '../screens/CustomerDetailScreen';
import MoreMenuScreen from '../screens/MoreMenuScreen';
import InvoiceListScreen from '../screens/InvoiceListScreen';
import InvoiceDetailScreen from '../screens/InvoiceDetailScreen';
import CallLogScreen from '../screens/CallLogScreen';
import AgentActivityScreen from '../screens/AgentActivityScreen';
import QuoteListScreen from '../screens/QuoteListScreen';
import SettingsScreen from '../screens/SettingsScreen';

const stackScreenOptions = {
  headerStyle: { backgroundColor: '#ffffff' },
  headerTintColor: theme.colors.onBackground,
  headerTitleStyle: { fontWeight: '600' as const, fontSize: 17 },
  headerShadowVisible: false,
};

// --- Schedule Stack (Schedule + Appointment Detail) ---
const ScheduleStack = createNativeStackNavigator<ScheduleStackParamList>();

function ScheduleStackNavigator() {
  return (
    <ScheduleStack.Navigator screenOptions={stackScreenOptions}>
      <ScheduleStack.Screen name="ScheduleList" component={ScheduleScreen} options={{ title: 'Schedule' }} />
      <ScheduleStack.Screen name="AppointmentDetail" component={AppointmentDetailScreen} options={{ title: 'Appointment' }} />
    </ScheduleStack.Navigator>
  );
}

// --- Jobs Stack (Jobs → Detail → Invoice) ---
const JobsStack = createNativeStackNavigator<JobsStackParamList>();

function JobsStackNavigator() {
  return (
    <JobsStack.Navigator screenOptions={stackScreenOptions}>
      <JobsStack.Screen name="JobsList" component={JobsScreen} options={{ title: 'Jobs' }} />
      <JobsStack.Screen name="JobDetail" component={JobDetailScreen} options={{ title: 'Job Details' }} />
      <JobsStack.Screen name="QuickInvoice" component={QuickInvoiceScreen} options={{ title: 'Create Invoice' }} />
    </JobsStack.Navigator>
  );
}

// --- Customers Stack ---
const CustomersStack = createNativeStackNavigator<CustomersStackParamList>();

function CustomersStackNavigator() {
  return (
    <CustomersStack.Navigator screenOptions={stackScreenOptions}>
      <CustomersStack.Screen name="CustomersList" component={CustomerListScreen} options={{ title: 'Customers' }} />
      <CustomersStack.Screen name="CustomerDetail" component={CustomerDetailScreen} options={{ title: 'Customer' }} />
    </CustomersStack.Navigator>
  );
}

// --- More Stack (Menu → sub-screens) ---
const MoreStack = createNativeStackNavigator<MoreStackParamList>();

function MoreStackNavigator() {
  return (
    <MoreStack.Navigator screenOptions={stackScreenOptions}>
      <MoreStack.Screen name="MoreMenu" component={MoreMenuScreen} options={{ title: 'More' }} />
      <MoreStack.Screen name="Invoices" component={InvoiceListScreen} options={{ title: 'Invoices' }} />
      <MoreStack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} options={{ title: 'Invoice' }} />
      <MoreStack.Screen name="CallLog" component={CallLogScreen} options={{ title: 'Call Log' }} />
      <MoreStack.Screen name="AgentActivity" component={AgentActivityScreen} options={{ title: 'Agent Activity' }} />
      <MoreStack.Screen name="QuoteList" component={QuoteListScreen} options={{ title: 'Quotes' }} />
      <MoreStack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </MoreStack.Navigator>
  );
}

// --- Tab Navigator (5 tabs) ---
const Tab = createBottomTabNavigator<TabParamList>();

export function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#f3f4f6',
          borderTopWidth: 1,
          paddingBottom: 4,
          paddingTop: 4,
          height: 60,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="DashboardTab"
        component={DashboardScreen}
        options={{
          headerShown: true,
          title: 'Dashboard',
          tabBarLabel: 'Home',
          headerStyle: { backgroundColor: theme.colors.primary },
          headerTintColor: '#ffffff',
          headerTitleStyle: { fontWeight: '700', fontSize: 18 },
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="ScheduleTab"
        component={ScheduleStackNavigator}
        options={{
          tabBarLabel: 'Schedule',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="calendar-today" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="JobsTab"
        component={JobsStackNavigator}
        options={{
          tabBarLabel: 'Jobs',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="wrench" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="CustomersTab"
        component={CustomersStackNavigator}
        options={{
          tabBarLabel: 'Customers',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-group" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="MoreTab"
        component={MoreStackNavigator}
        options={{
          tabBarLabel: 'More',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="dots-horizontal" color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
