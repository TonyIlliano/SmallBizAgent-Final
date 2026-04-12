import { apiRequest } from './client';

export interface Appointment {
  id: number;
  businessId: number;
  customerId: number;
  staffId: number | null;
  serviceId: number | null;
  startDate: string;
  endDate: string;
  status: string;
  notes: string | null;
  createdAt: string;
  customer?: { id: number; firstName: string; lastName: string; phone: string; email: string };
  staff?: { id: number; firstName: string; lastName: string; specialty: string | null };
  service?: { id: number; name: string; price: number; duration: number };
}

export function getAppointments(date?: string): Promise<Appointment[]> {
  const params = date ? `?date=${date}` : '';
  return apiRequest('GET', `/api/appointments${params}`);
}

export function getAppointment(id: number): Promise<Appointment> {
  return apiRequest('GET', `/api/appointments/${id}`);
}

export function updateAppointment(id: number, data: Partial<Appointment>): Promise<Appointment> {
  return apiRequest('PUT', `/api/appointments/${id}`, data as Record<string, unknown>);
}
