/**
 * HVAC quote templates — pre-built line item bundles that auto-populate a
 * new quote with sensible defaults. Owners can edit any line, change prices,
 * or remove items before sending. Prices are starting points only; actual
 * pricing varies by region, equipment brand, and site conditions.
 *
 * Used by:
 *   - GET  /api/quotes/templates?industry=hvac    (list templates)
 *   - POST /api/quotes/from-template               (create a quote from one)
 */

export interface QuoteLineItem {
  description: string;
  quantity: number;
  unitPrice: number; // dollars, will be stringified for NUMERIC column
}

export interface QuoteTemplate {
  id: string;
  name: string;
  description: string;
  category: 'repair' | 'install' | 'maintenance' | 'iaq';
  lineItems: QuoteLineItem[];
}

export const HVAC_QUOTE_TEMPLATES: QuoteTemplate[] = [
  {
    id: 'compressor-replacement',
    name: 'Compressor Replacement',
    description: 'Diagnose failed compressor, install replacement, recharge refrigerant. Typical 3 hr job.',
    category: 'repair',
    lineItems: [
      { description: 'Diagnostic fee (credited if approved)', quantity: 1, unitPrice: 125 },
      { description: 'Replacement compressor (matched to system)', quantity: 1, unitPrice: 1450 },
      { description: 'Labor — compressor swap (3 hrs)', quantity: 3, unitPrice: 150 },
      { description: 'Refrigerant recharge (R-410A, ~6 lbs)', quantity: 6, unitPrice: 95 },
      { description: 'New filter drier + start capacitor', quantity: 1, unitPrice: 75 },
      { description: '1-year parts & labor warranty on installed parts', quantity: 1, unitPrice: 0 },
    ],
  },
  {
    id: 'full-system-install',
    name: 'Full Central AC + Furnace Install',
    description: 'Complete new central HVAC system: outdoor condenser + indoor air handler + thermostat. Includes removal of existing equipment.',
    category: 'install',
    lineItems: [
      { description: 'Outdoor condenser (16 SEER, matched tonnage)', quantity: 1, unitPrice: 2800 },
      { description: 'Indoor air handler / coil', quantity: 1, unitPrice: 1400 },
      { description: 'Smart programmable thermostat', quantity: 1, unitPrice: 250 },
      { description: 'Refrigerant line set + insulation', quantity: 1, unitPrice: 350 },
      { description: 'Electrical disconnect + condensate line', quantity: 1, unitPrice: 200 },
      { description: 'Installation labor (8 hrs, 2 techs)', quantity: 16, unitPrice: 125 },
      { description: 'Permit + city inspection fee', quantity: 1, unitPrice: 175 },
      { description: 'Removal & disposal of old equipment', quantity: 1, unitPrice: 200 },
      { description: '10-year manufacturer parts warranty', quantity: 1, unitPrice: 0 },
      { description: '1-year labor warranty', quantity: 1, unitPrice: 0 },
    ],
  },
  {
    id: 'furnace-replacement',
    name: 'Furnace Replacement',
    description: 'Replace existing gas furnace with high-efficiency model. Includes venting modifications and gas line check.',
    category: 'install',
    lineItems: [
      { description: 'High-efficiency gas furnace (95% AFUE)', quantity: 1, unitPrice: 2200 },
      { description: 'Installation labor (6 hrs)', quantity: 6, unitPrice: 125 },
      { description: 'Venting modifications (PVC for high-eff condensing)', quantity: 1, unitPrice: 350 },
      { description: 'Gas line inspection + pressure test', quantity: 1, unitPrice: 125 },
      { description: 'New thermostat (basic programmable)', quantity: 1, unitPrice: 150 },
      { description: 'Permit + inspection', quantity: 1, unitPrice: 125 },
      { description: 'Removal & disposal of old unit', quantity: 1, unitPrice: 150 },
      { description: '10-year parts warranty + 1-year labor', quantity: 1, unitPrice: 0 },
    ],
  },
  {
    id: 'heat-pump-install',
    name: 'Heat Pump Install',
    description: 'Energy-efficient heat pump replacing existing AC + electric heat. Eligible for federal tax credits.',
    category: 'install',
    lineItems: [
      { description: 'Heat pump outdoor unit (16 SEER, 9 HSPF)', quantity: 1, unitPrice: 3200 },
      { description: 'Matching indoor air handler', quantity: 1, unitPrice: 1500 },
      { description: 'Refrigerant line set', quantity: 1, unitPrice: 350 },
      { description: 'Electrical work (upgrade disconnect if needed)', quantity: 1, unitPrice: 300 },
      { description: 'Smart thermostat (heat pump optimized)', quantity: 1, unitPrice: 275 },
      { description: 'Installation labor (8 hrs)', quantity: 8, unitPrice: 125 },
      { description: 'Permit + inspection', quantity: 1, unitPrice: 175 },
      { description: 'Removal of old equipment', quantity: 1, unitPrice: 200 },
    ],
  },
  {
    id: 'mini-split-single-zone',
    name: 'Mini-Split — Single Zone',
    description: 'Ductless mini-split for additions, garages, or single-room cooling. No ductwork required.',
    category: 'install',
    lineItems: [
      { description: 'Ductless indoor head unit (12,000 BTU)', quantity: 1, unitPrice: 850 },
      { description: 'Outdoor condenser unit', quantity: 1, unitPrice: 950 },
      { description: 'Line set + electrical (25 ft)', quantity: 1, unitPrice: 275 },
      { description: 'Wall mount + line hide kit', quantity: 1, unitPrice: 150 },
      { description: 'Installation labor (4 hrs)', quantity: 4, unitPrice: 125 },
      { description: 'Refrigerant charge + system commissioning', quantity: 1, unitPrice: 175 },
      { description: 'Permit if required', quantity: 1, unitPrice: 100 },
    ],
  },
  {
    id: 'ductwork-repair',
    name: 'Ductwork Repair / Modification',
    description: 'Replace or seal leaking ductwork sections. Improves airflow and energy efficiency.',
    category: 'repair',
    lineItems: [
      { description: 'Sheet metal ductwork (per linear foot)', quantity: 30, unitPrice: 18 },
      { description: 'Insulation wrap (R-6 fiberglass)', quantity: 30, unitPrice: 5 },
      { description: 'Mastic sealant + zip ties', quantity: 1, unitPrice: 75 },
      { description: 'Labor — fabrication + install (4 hrs)', quantity: 4, unitPrice: 125 },
      { description: 'Static pressure test before/after', quantity: 1, unitPrice: 100 },
    ],
  },
  {
    id: 'maintenance-plan',
    name: 'Annual Maintenance Plan',
    description: 'Two seasonal tune-ups per year (spring AC, fall furnace), priority scheduling, 15% repair discount.',
    category: 'maintenance',
    lineItems: [
      { description: 'Spring AC tune-up (cleaning, refrigerant check, electrical)', quantity: 1, unitPrice: 125 },
      { description: 'Fall furnace tune-up (combustion analysis, safety check)', quantity: 1, unitPrice: 125 },
      { description: 'Priority service scheduling for plan members', quantity: 1, unitPrice: 0 },
      { description: '15% discount on any repairs during plan term', quantity: 1, unitPrice: 0 },
      { description: 'Plan discount applied', quantity: 1, unitPrice: -50 },
    ],
  },
  {
    id: 'iaq-package',
    name: 'Indoor Air Quality Package',
    description: 'UV light, HEPA filtration, whole-home humidifier. Best for allergy sufferers and households with respiratory issues.',
    category: 'iaq',
    lineItems: [
      { description: 'UV-C germicidal light (in-duct)', quantity: 1, unitPrice: 550 },
      { description: 'HEPA media filter housing + filter', quantity: 1, unitPrice: 650 },
      { description: 'Whole-home humidifier (bypass style)', quantity: 1, unitPrice: 425 },
      { description: 'Installation labor (3 hrs)', quantity: 3, unitPrice: 125 },
      { description: 'Calibration + walk-through with homeowner', quantity: 1, unitPrice: 0 },
      { description: 'Annual filter replacement reminder (free with plan)', quantity: 1, unitPrice: 0 },
    ],
  },
];

/**
 * Look up a template by id. Returns null if not found.
 */
export function getHvacTemplate(id: string): QuoteTemplate | null {
  return HVAC_QUOTE_TEMPLATES.find(t => t.id === id) || null;
}

/**
 * Compute the subtotal for a template (used for the "Estimated total" hint
 * on the template-picker UI).
 */
export function templateSubtotal(t: QuoteTemplate): number {
  return t.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}
