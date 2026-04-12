import { apiRequest } from './client';

export interface Customer {
  id: number;
  businessId: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address?: string;
  city?: string;
  state?: string;
  tags?: string[];
  createdAt: string;
}

export function getCustomers(search?: string): Promise<Customer[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiRequest('GET', `/api/customers${params}`);
}

export function getCustomer(id: number): Promise<Customer> {
  return apiRequest('GET', `/api/customers/${id}`);
}
