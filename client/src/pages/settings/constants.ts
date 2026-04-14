import { z } from "zod";

// Industry options for AI receptionist
export const INDUSTRY_OPTIONS = [
  { value: "automotive", label: "Automotive / Auto Repair" },
  { value: "plumbing", label: "Plumbing" },
  { value: "hvac", label: "HVAC / Heating & Cooling" },
  { value: "electrical", label: "Electrical" },
  { value: "salon", label: "Salon / Spa" },
  { value: "cleaning", label: "Cleaning Services" },
  { value: "landscaping", label: "Landscaping" },
  { value: "construction", label: "Construction / Contractors" },
  { value: "medical", label: "Medical / Healthcare" },
  { value: "dental", label: "Dental" },
  { value: "veterinary", label: "Veterinary" },
  { value: "fitness", label: "Fitness / Gym" },
  { value: "restaurant", label: "Restaurant / Food Service" },
  { value: "retail", label: "Retail" },
  { value: "professional", label: "Professional Services" },
  { value: "general", label: "General / Other" },
];

// Timezone options for US businesses
export const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern Time (EST/EDT)" },
  { value: "America/Chicago", label: "Central Time (CST/CDT)" },
  { value: "America/Denver", label: "Mountain Time (MST/MDT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PST/PDT)" },
  { value: "America/Phoenix", label: "Arizona (MST, no DST)" },
  { value: "America/Anchorage", label: "Alaska Time (AKST/AKDT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HST)" },
];

// Business Profile Schema
export const businessProfileSchema = z.object({
  name: z.string().min(2, "Business name must be at least 2 characters"),
  industry: z.string().optional(),
  timezone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
  ownerPhone: z.string().min(10, "Cell phone must be at least 10 digits").optional().or(z.literal("")),
  email: z.string().email("Invalid email address"),
  website: z.string().url("Invalid website URL").optional().or(z.literal("")),
  logoUrl: z.string().optional().or(z.literal("")),
});

// Business Hours Schema
export const businessHoursSchema = z.object({
  monday: z.object({
    isClosed: z.boolean(),
    open: z.string().optional(),
    close: z.string().optional(),
  }),
  tuesday: z.object({
    isClosed: z.boolean(),
    open: z.string().optional(),
    close: z.string().optional(),
  }),
  wednesday: z.object({
    isClosed: z.boolean(),
    open: z.string().optional(),
    close: z.string().optional(),
  }),
  thursday: z.object({
    isClosed: z.boolean(),
    open: z.string().optional(),
    close: z.string().optional(),
  }),
  friday: z.object({
    isClosed: z.boolean(),
    open: z.string().optional(),
    close: z.string().optional(),
  }),
  saturday: z.object({
    isClosed: z.boolean(),
    open: z.string().optional(),
    close: z.string().optional(),
  }),
  sunday: z.object({
    isClosed: z.boolean(),
    open: z.string().optional(),
    close: z.string().optional(),
  }),
});

// Service Schema
export const serviceSchema = z.object({
  name: z.string().min(2, "Service name must be at least 2 characters"),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "Price must be 0 or greater"),
  duration: z.coerce.number().min(15, "Duration must be at least 15 minutes"),
  active: z.boolean().default(true),
});

export type ServiceFormData = z.infer<typeof serviceSchema>;

// Preset brand color swatches
export const BRAND_COLOR_PRESETS = [
  { hex: "#2563eb", label: "Blue" },
  { hex: "#7c3aed", label: "Purple" },
  { hex: "#059669", label: "Green" },
  { hex: "#dc2626", label: "Red" },
  { hex: "#d97706", label: "Amber" },
  { hex: "#0891b2", label: "Cyan" },
  { hex: "#e11d48", label: "Rose" },
  { hex: "#4f46e5", label: "Indigo" },
];

// Shared settings section definitions
export interface SettingsTab {
  value: string;
  label: string;
}

export interface SettingsSection {
  title: string;
  tabs: SettingsTab[];
}

export function buildSettingsSections({
  isRestaurant,
  hasPOS,
  isAdmin,
}: {
  isRestaurant: boolean;
  hasPOS: boolean;
  isAdmin: boolean;
}): SettingsSection[] {
  return [
    {
      title: "Business",
      tabs: [
        { value: "profile", label: "Profile" },
        { value: "hours", label: "Hours" },
        ...(!isRestaurant ? [{ value: "services", label: "Services" }] : []),
        { value: "team", label: "Team" },
        ...(!isRestaurant ? [{ value: "booking", label: "Booking" }] : []),
      ],
    },
    {
      title: "Communication",
      tabs: [
        { value: "phone-numbers", label: "Phone Numbers" },
        { value: "notifications", label: "Notifications" },
        { value: "reviews", label: "Reviews" },
      ],
    },
    {
      title: "Integrations",
      tabs: [
        { value: "integrations", label: "Calendar & Payments" },
        ...(isRestaurant ? [{ value: "restaurant", label: "POS (Restaurant)" }] : []),
        ...(isRestaurant ? [{ value: "reservations", label: "Reservations" }] : []),
        ...(hasPOS ? [{ value: "inventory", label: "Inventory" }] : []),
        ...(isAdmin ? [{ value: "integrations-health", label: "Integration Health" }] : []),
      ],
    },
    {
      title: "Billing",
      tabs: [
        { value: "subscription", label: "Subscription" },
        { value: "locations", label: "Locations" },
      ],
    },
    {
      title: "Account",
      tabs: [
        { value: "pwa", label: "App" },
        { value: "security", label: "Security" },
        { value: "privacy", label: "Privacy" },
        ...(isAdmin ? [{ value: "agent-insights", label: "AI Insights" }] : []),
      ],
    },
  ];
}
