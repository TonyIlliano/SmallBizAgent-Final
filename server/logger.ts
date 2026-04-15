/**
 * Structured Logger
 *
 * JSON logger with levels, request ID injection, Sentry breadcrumbs,
 * and child logger support for module-scoped context.
 * Configurable via LOG_LEVEL environment variable.
 */

import { getRequestId } from './utils/requestContext';

// Lazy Sentry import to avoid circular dependencies at startup
let Sentry: typeof import('@sentry/node') | null = null;
try {
  Sentry = require('@sentry/node');
} catch {
  // Sentry not available — breadcrumbs disabled
}

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

interface LogMeta {
  [key: string]: any;
}

type LoggerInstance = {
  error: (msg: string, meta?: LogMeta) => void;
  warn: (msg: string, meta?: LogMeta) => void;
  info: (msg: string, meta?: LogMeta) => void;
  debug: (msg: string, meta?: LogMeta) => void;
  child: (defaults: LogMeta) => LoggerInstance;
};

function log(level: LogLevel, message: string, meta?: LogMeta, defaults?: LogMeta) {
  if (LOG_LEVELS[level] > LOG_LEVELS[currentLevel]) return;

  const requestId = getRequestId();
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    requestId: requestId !== 'unknown' ? requestId : undefined,
    message,
    ...defaults,
    ...meta,
  };

  // Add Sentry breadcrumbs for error/warn levels
  if ((level === 'error' || level === 'warn') && Sentry) {
    try {
      Sentry.addBreadcrumb({
        level: level === 'error' ? 'error' : 'warning',
        message,
        data: { ...defaults, ...meta },
        timestamp: Date.now() / 1000,
      });
    } catch {
      // Sentry breadcrumb failed — don't break logging
    }
  }

  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

function createLogger(defaults?: LogMeta): LoggerInstance {
  return {
    error: (msg: string, meta?: LogMeta) => log('error', msg, meta, defaults),
    warn: (msg: string, meta?: LogMeta) => log('warn', msg, meta, defaults),
    info: (msg: string, meta?: LogMeta) => log('info', msg, meta, defaults),
    debug: (msg: string, meta?: LogMeta) => log('debug', msg, meta, defaults),
    child: (childDefaults: LogMeta) => createLogger({ ...defaults, ...childDefaults }),
  };
}

export const logger = createLogger();

export default logger;
