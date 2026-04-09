/**
 * Managed Agents — Shared Anthropic Client & Environment Caching
 *
 * Uses the same Anthropic SDK instance (ANTHROPIC_API_KEY) as claudeClient.ts.
 * Caches the environment ID after initial setup to avoid re-creating.
 */
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

let cachedEnvironmentId: string | null = null;

/**
 * Returns the Anthropic client singleton.
 */
export function getClient(): Anthropic {
  return client;
}

/**
 * Returns the environment ID for managed agent sessions.
 * Reads from env var (set after running setupAgents.ts) or creates on-demand.
 */
export async function getOrCreateEnvironment(): Promise<string> {
  if (cachedEnvironmentId) return cachedEnvironmentId;

  // Check env var first (set after running setupAgents)
  if (process.env.MANAGED_AGENT_ENV_ID) {
    cachedEnvironmentId = process.env.MANAGED_AGENT_ENV_ID;
    return cachedEnvironmentId;
  }

  // Create environment on-demand (should only happen during initial setup)
  console.log('[ManagedAgents] Creating environment...');
  const env = await client.beta.environments.create({
    name: 'smallbizagent-prod',
    config: {
      type: 'cloud',
      networking: { type: 'unrestricted' },
    },
  });
  cachedEnvironmentId = env.id;
  console.log(`[ManagedAgents] Environment created: ${env.id}`);
  return cachedEnvironmentId;
}
