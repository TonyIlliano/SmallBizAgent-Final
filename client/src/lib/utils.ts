import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string, timezone?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  };
  if (timezone) options.timeZone = timezone;
  return d.toLocaleDateString('en-US', options);
}

export function formatTime(date: Date | string, timezone?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const options: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  };
  if (timezone) options.timeZone = timezone;
  return d.toLocaleTimeString('en-US', options);
}

export function formatDateTime(date: Date | string, timezone?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${formatDate(d, timezone)} at ${formatTime(d, timezone)}`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

export function formatPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) return '';

  let cleaned = phoneNumber.replace(/\D/g, '');
  // Strip leading country code (1 for US)
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    cleaned = cleaned.substring(1);
  }

  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
  if (match) {
    return `(${match[1]}) ${match[2]}-${match[3]}`;
  }

  return phoneNumber;
}

export function truncateText(text: string, length: number): string {
  if (!text) return '';
  if (text.length <= length) return text;
  
  return text.slice(0, length) + '...';
}

export function getInitials(firstName: string, lastName: string): string {
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
}

export function generateInvoiceNumber(): string {
  const prefix = 'INV';
  const year = new Date().getFullYear();
  const randomNumber = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  
  return `${prefix}-${year}-${randomNumber}`;
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(later, wait);
  };
}
