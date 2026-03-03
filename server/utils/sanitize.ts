/**
 * Sanitize business objects to remove sensitive credentials from API responses.
 * Replaces sensitive token/key fields with boolean "Connected" flags.
 */
const BUSINESS_SENSITIVE_FIELDS = [
  'quickbooksAccessToken',
  'quickbooksRefreshToken',
  'cloverAccessToken',
  'cloverRefreshToken',
  'squareAccessToken',
  'squareRefreshToken',
  'heartlandApiKey',
] as const;

export function sanitizeBusiness(business: any): any {
  if (!business) return business;
  const sanitized = { ...business };
  for (const field of BUSINESS_SENSITIVE_FIELDS) {
    if (field in sanitized) {
      const hasValue = !!sanitized[field];
      delete sanitized[field];
      // Add a boolean flag so frontend knows if the integration is connected
      const connectedKey = field.replace(/Token$|Key$/, '') + 'Connected';
      sanitized[connectedKey] = hasValue;
    }
  }
  return sanitized;
}

export function sanitizeReceptionistConfig(config: any): any {
  if (!config) return config;
  const sanitized = { ...config };
  // Don't expose transfer phone numbers in diagnostic endpoints
  if (sanitized.transferPhoneNumbers) {
    sanitized.hasTransferNumbers = true;
    delete sanitized.transferPhoneNumbers;
  }
  return sanitized;
}
