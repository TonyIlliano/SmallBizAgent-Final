import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;        // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16;   // 128-bit auth tag
const KEY_VERSION = 'v1';
const ENCRYPTED_PREFIX = 'enc:';

// Cache the key buffer to avoid re-parsing on every call
let cachedKey: Buffer | null = null;

/**
 * Get the encryption key from environment, or use a development fallback.
 * In production, ENCRYPTION_KEY must be set (32-byte key as 64 hex chars).
 */
function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const keyHex = process.env.ENCRYPTION_KEY;

  if (process.env.NODE_ENV === 'production' && !keyHex) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required in production. ' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  if (!keyHex) {
    // Development fallback: deterministic key so encrypted data persists across restarts
    console.warn('[Encryption] WARNING: Using development encryption key. Set ENCRYPTION_KEY in production.');
    cachedKey = Buffer.from('0'.repeat(64), 'hex'); // 32 zero bytes - dev only
    return cachedKey;
  }

  if (keyHex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
  }

  cachedKey = Buffer.from(keyHex, 'hex');
  return cachedKey;
}

/**
 * Check if a value is already encrypted (starts with the encrypted prefix).
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Encrypt a plaintext string.
 * Returns: enc:v1:{iv_hex}:{authTag_hex}:{ciphertext_hex}
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${ENCRYPTED_PREFIX}${KEY_VERSION}:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an encrypted string.
 * Accepts: enc:v1:{iv_hex}:{authTag_hex}:{ciphertext_hex}
 * Also accepts plaintext (for backward compatibility during migration).
 */
export function decrypt(value: string): string {
  if (!isEncrypted(value)) {
    // Return plaintext as-is (pre-migration data)
    return value;
  }

  const parts = value.split(':');
  // parts: ['enc', 'v1', iv, authTag, ciphertext]
  if (parts.length !== 5) {
    throw new Error('Invalid encrypted value format');
  }

  const [, version, ivHex, authTagHex, ciphertext] = parts;

  if (version !== KEY_VERSION) {
    throw new Error(`Unsupported encryption key version: ${version}`);
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Encrypt a field value, handling nulls.
 * Returns null if input is null/undefined.
 * Skips encryption if the value is already encrypted.
 */
export function encryptField(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (isEncrypted(value)) return value; // Already encrypted
  return encrypt(value);
}

/**
 * Decrypt a field value, handling nulls.
 * Returns null if input is null/undefined.
 * Returns plaintext as-is if not encrypted (backward-compatible).
 */
export function decryptField(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return decrypt(value);
}
