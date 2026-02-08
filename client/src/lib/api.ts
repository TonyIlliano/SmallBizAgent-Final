import { apiRequest as baseApiRequest } from "./queryClient";

/**
 * Make an API request to the server
 *
 * @param method HTTP method
 * @param url Endpoint URL
 * @param data Optional data payload
 * @returns Promise with the response
 */
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown
): Promise<any> {
  const response = await baseApiRequest(method, url, data);
  // Handle 204 No Content responses (e.g., DELETE requests)
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

/**
 * Fetch business profile
 *
 * @param businessId Business ID
 * @returns Promise with business data
 */
export async function fetchBusiness(businessId: number): Promise<any> {
  return apiRequest("GET", `/api/business/${businessId}`);
}

/**
 * Fetch business hours
 *
 * @param businessId Business ID
 * @returns Promise with business hours data
 */
export async function fetchBusinessHours(businessId: number): Promise<any> {
  return apiRequest("GET", `/api/business/${businessId}/hours`);
}

/**
 * Fetch customers
 *
 * @param businessId Business ID
 * @returns Promise with customers data
 */
export async function fetchCustomers(businessId: number): Promise<any> {
  return apiRequest("GET", `/api/customers?businessId=${businessId}`);
}

/**
 * Fetch a specific customer
 *
 * @param customerId Customer ID
 * @returns Promise with customer data
 */
export async function fetchCustomer(customerId: number): Promise<any> {
  return apiRequest("GET", `/api/customers/${customerId}`);
}

/**
 * Fetch staff members
 *
 * @param businessId Business ID
 * @returns Promise with staff data
 */
export async function fetchStaff(businessId: number): Promise<any> {
  return apiRequest("GET", `/api/staff?businessId=${businessId}`);
}

/**
 * Fetch services
 *
 * @param businessId Business ID
 * @returns Promise with services data
 */
export async function fetchServices(businessId: number): Promise<any> {
  return apiRequest("GET", `/api/services?businessId=${businessId}`);
}

/**
 * Fetch appointments
 *
 * @param businessId Business ID
 * @param params Additional query parameters
 * @returns Promise with appointments data
 */
export async function fetchAppointments(
  businessId: number,
  params: Record<string, any> = {}
): Promise<any> {
  const queryParams = new URLSearchParams({
    businessId: businessId.toString(),
    ...params
  });
  return apiRequest("GET", `/api/appointments?${queryParams}`);
}

/**
 * Fetch jobs
 *
 * @param businessId Business ID
 * @param params Additional query parameters
 * @returns Promise with jobs data
 */
export async function fetchJobs(
  businessId: number,
  params: Record<string, any> = {}
): Promise<any> {
  const queryParams = new URLSearchParams({
    businessId: businessId.toString(),
    ...params
  });
  return apiRequest("GET", `/api/jobs?${queryParams}`);
}

/**
 * Fetch invoices
 *
 * @param businessId Business ID
 * @param params Additional query parameters
 * @returns Promise with invoices data
 */
export async function fetchInvoices(
  businessId: number,
  params: Record<string, any> = {}
): Promise<any> {
  const queryParams = new URLSearchParams({
    businessId: businessId.toString(),
    ...params
  });
  return apiRequest("GET", `/api/invoices?${queryParams}`);
}

/**
 * Fetch call logs
 *
 * @param businessId Business ID
 * @param params Additional query parameters
 * @returns Promise with call logs data
 */
export async function fetchCallLogs(
  businessId: number,
  params: Record<string, any> = {}
): Promise<any> {
  const queryParams = new URLSearchParams({
    businessId: businessId.toString(),
    ...params
  });
  return apiRequest("GET", `/api/call-logs?${queryParams}`);
}

/**
 * Fetch virtual receptionist configuration
 *
 * @param businessId Business ID
 * @returns Promise with configuration data
 */
export async function fetchReceptionistConfig(businessId: number): Promise<any> {
  return apiRequest("GET", `/api/receptionist-config/${businessId}`);
}

/**
 * Create a Stripe payment intent
 *
 * @param amount Amount in dollars
 * @param invoiceId Invoice ID
 * @returns Promise with payment intent data
 */
export async function createPaymentIntent(amount: number, invoiceId: number): Promise<any> {
  return apiRequest("POST", "/api/create-payment-intent", { amount, invoiceId });
}
