import { apiRequest } from './client';

export interface Job {
  id: number;
  businessId: number;
  customerId: number;
  appointmentId: number | null;
  staffId: number | null;
  title: string;
  description: string | null;
  scheduledDate: string | null;
  status: 'pending' | 'in_progress' | 'waiting_parts' | 'completed' | 'cancelled';
  notes: string | null;
  photos: Array<{ url: string; caption?: string; takenAt: string }> | null;
  createdAt: string;
  updatedAt: string;
  customer?: { id: number; firstName: string; lastName: string; phone: string; email: string; address?: string };
  staff?: { id: number; firstName: string; lastName: string };
  lineItems?: Array<{ id: number; type: string; description: string; quantity: number; unitPrice: number }>;
}

export function getJobs(status?: string): Promise<Job[]> {
  const params = status ? `?status=${status}` : '';
  return apiRequest('GET', `/api/jobs${params}`);
}

export function getJob(id: number): Promise<Job> {
  return apiRequest('GET', `/api/jobs/${id}`);
}

export function updateJob(id: number, data: Partial<Job>): Promise<Job> {
  return apiRequest('PUT', `/api/jobs/${id}`, data as Record<string, unknown>);
}

export function updateJobStatus(id: number, status: Job['status']): Promise<Job> {
  return apiRequest('PUT', `/api/jobs/${id}`, { status });
}

export interface ParsedVoiceNotes {
  notes: string;
  partsUsed: Array<{ name: string; quantity?: number }>;
  equipmentInfo: string | null;
  followUpNeeded: boolean;
  followUpDescription: string | null;
  estimatedFollowUpCost: number | null;
  completionSummary: string;
}

export interface VoiceNotesResponse {
  parsed: ParsedVoiceNotes;
  saved: boolean;
  fallback?: boolean;
}

export function processVoiceNotes(jobId: number, transcript: string): Promise<VoiceNotesResponse> {
  return apiRequest('POST', `/api/jobs/${jobId}/voice-notes`, { transcript });
}

export interface JobBriefing {
  summary: string;
  customerContext: string;
  jobHistory: string;
  currentJob: string;
  sentiment: string;
  suggestedApproach: string;
  followUpOpportunities: string[];
  generatedAt: string;
}

export function getJobBriefing(jobId: number): Promise<JobBriefing> {
  return apiRequest('GET', `/api/jobs/${jobId}/briefing`);
}

export async function uploadJobPhoto(jobId: number, uri: string): Promise<{ photoUrl: string }> {
  const formData = new FormData();
  const filename = uri.split('/').pop() || 'photo.jpg';
  formData.append('photo', {
    uri,
    name: filename,
    type: 'image/jpeg',
  } as any);

  return apiRequest('POST', `/api/jobs/${jobId}/photos`, formData);
}
