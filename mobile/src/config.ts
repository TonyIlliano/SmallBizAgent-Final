const DEV_API_URL = 'http://localhost:5000';
const PROD_API_URL = 'https://www.smallbizagent.ai';

// Set to true to test against production Railway server during development
const USE_PROD_IN_DEV = true;

export const API_BASE_URL = __DEV__ && !USE_PROD_IN_DEV ? DEV_API_URL : PROD_API_URL;
