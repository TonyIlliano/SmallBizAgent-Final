import { apiRequest } from './client';

export interface Invoice {
  id: number;
  businessId: number;
  customerId: number;
  invoiceNumber: string;
  amount: number;
  total: number;
  tax: number | null;
  status: string;
  dueDate: string | null;
  createdAt: string;
  customer?: { id: number; firstName: string; lastName: string; phone: string; email: string };
  items?: Array<{ id: number; description: string; quantity: number; unitPrice: number }>;
}

export interface CreateInvoiceData {
  customerId: number;
  items: Array<{ description: string; quantity: number; unitPrice: number }>;
  tax?: number;
  dueDate?: string;
  notes?: string;
}

export function getInvoices(): Promise<Invoice[]> {
  return apiRequest('GET', '/api/invoices');
}

export function createInvoice(data: CreateInvoiceData): Promise<Invoice> {
  return apiRequest('POST', '/api/invoices', data as unknown as Record<string, unknown>);
}

export function sendInvoice(id: number, method: 'sms' | 'email'): Promise<void> {
  return apiRequest('POST', `/api/invoices/${id}/send`, { method });
}
