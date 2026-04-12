export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
};

export type TabParamList = {
  DashboardTab: undefined;
  ScheduleTab: undefined;
  JobsTab: undefined;
  CustomersTab: undefined;
  MoreTab: undefined;
};

export type ScheduleStackParamList = {
  ScheduleList: undefined;
  AppointmentDetail: { appointmentId: number };
};

export type JobsStackParamList = {
  JobsList: undefined;
  JobDetail: { jobId: number };
  QuickInvoice: { jobId: number; customerId: number };
};

export type CustomersStackParamList = {
  CustomersList: undefined;
  CustomerDetail: { customerId: number };
};

export type InvoicesStackParamList = {
  InvoiceList: undefined;
  InvoiceDetail: { invoiceId: number };
};

export type MoreStackParamList = {
  MoreMenu: undefined;
  Invoices: undefined;
  InvoiceDetail: { invoiceId: number };
  CallLog: undefined;
  AgentActivity: undefined;
  QuoteList: undefined;
  QuoteDetail: { quoteId: number };
  Settings: undefined;
  Analytics: undefined;
};
