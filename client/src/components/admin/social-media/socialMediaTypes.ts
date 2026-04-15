/**
 * Shared types, constants, and helper functions for the Social Media admin page.
 */

// ── Types ───────────────────────────────────────────────────────────────

export interface ConnectionStatus {
  connected: boolean;
  connectedAt?: string;
}

export interface SocialPost {
  id: number;
  platform: string;
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  thumbnailUrl: string | null;
  status: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  externalPostId: string | null;
  industry: string | null;
  details: any;
  rejectionReason: string | null;
  editedContent: string | null;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  engagementScore: number;
  isWinner: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VideoBriefData {
  hook: string;
  voiceover: string | null;
  screen_sequence: Array<{ duration: string; clip: string; note?: string }>;
  broll: string;
  caption: string;
  hashtags: string[];
  cta_overlay: string;
  boost_targeting: string;
  boost_budget: string;
  stock_search_terms: string[];
  estimated_duration?: number;
}

export interface VideoBrief {
  id: number;
  vertical: string;
  platform: string;
  pillar: string | null;
  briefData: VideoBriefData;
  sourceWinnerIds: number[] | null;
  renderStatus: string | null;
  renderId: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  voiceoverUrl: string | null;
  aspectRatio: string | null;
  renderError: string | null;
  renderedAt: string | null;
  createdAt: string;
}

export interface VideoClip {
  id: number;
  name: string;
  description: string | null;
  category: string;
  s3Key: string;
  s3Url: string;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  mimeType: string | null;
  tags: string[] | null;
  sortOrder: number;
  createdAt: string;
}

export interface TTSVoice {
  id: string;
  name: string;
  description: string;
}

export interface PipelineStatus {
  shotstack: boolean;
  pexels: boolean;
  tts: boolean;
  s3: boolean;
  ready: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────

export const CLIP_CATEGORIES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "calls", label: "Incoming Calls" },
  { id: "calendar", label: "Calendar / Booking" },
  { id: "sms", label: "SMS / Messages" },
  { id: "invoice", label: "Invoicing" },
  { id: "crm", label: "Customer CRM" },
  { id: "agents", label: "AI Agents" },
  { id: "general", label: "General" },
];

export const PLATFORMS = [
  { id: "twitter", name: "X / Twitter", color: "bg-black text-white", icon: "\u{1D54F}" },
  { id: "facebook", name: "Facebook", color: "bg-blue-600 text-white", icon: "f" },
  { id: "instagram", name: "Instagram", color: "bg-gradient-to-r from-purple-500 to-pink-500 text-white", icon: "\uD83D\uDCF7" },
  { id: "linkedin", name: "LinkedIn", color: "bg-blue-700 text-white", icon: "in" },
] as const;

export const VERTICALS = [
  "Barbershops", "Salons", "HVAC", "Plumbing", "Landscaping", "Electrical",
  "Cleaning", "Construction", "Automotive", "Dental", "Medical", "Veterinary",
  "Fitness", "Restaurant", "Retail", "Professional Services",
];

export const CONTENT_PILLARS = [
  { id: "pain", label: "Pain Amplification" },
  { id: "feature", label: "Feature in Context" },
  { id: "proof", label: "Social Proof / Outcome" },
  { id: "education", label: "Education" },
  { id: "behind", label: "Behind the Build" },
];

export const AD_TARGETING = {
  interests: [
    "Small business owner", "Barbershop", "Hair salon", "HVAC services",
    "Landscaping", "Booksy", "StyleSeat", "Square Appointments",
    "Jobber", "Service business", "Entrepreneurship",
  ],
  behaviors: [
    "Small business owners", "Business page admins",
    "Engaged shoppers", "Mobile business",
  ],
  demographics: {
    age: "28-55",
    locations: "United States",
    jobTitles: ["Owner", "Founder", "Self-employed", "Independent contractor"],
  },
  budget: "$5-20/day per boosted post",
  objective: "Lead generation -> Demo booking",
  cta: "Book Now -> smallbizagent.ai/demo",
};

// ── Helpers ──────────────────────────────────────────────────────────────

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "\u2014";
  }
}

export function getExternalUrl(platform: string, postId: string): string {
  switch (platform) {
    case "twitter":
      return `https://twitter.com/i/status/${postId}`;
    case "facebook":
      return `https://facebook.com/${postId}`;
    case "instagram":
      return `https://instagram.com/p/${postId}`;
    case "linkedin":
      return `https://linkedin.com/feed/update/${postId}`;
    default:
      return "#";
  }
}

export function getCategoryIcon(cat: string): string {
  switch (cat) {
    case "dashboard": return "\uD83D\uDCCA";
    case "calls": return "\uD83D\uDCDE";
    case "calendar": return "\uD83D\uDCC5";
    case "sms": return "\uD83D\uDCAC";
    case "invoice": return "\uD83D\uDCB0";
    case "crm": return "\uD83D\uDC64";
    case "agents": return "\uD83E\uDD16";
    default: return "\uD83C\uDFAC";
  }
}

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return "\u2014";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
