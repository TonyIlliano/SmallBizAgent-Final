/**
 * Structured Logger
 *
 * Simple JSON logger with levels for production debugging.
 * Configurable via LOG_LEVEL environment variable.
 */

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function log(level: LogLevel, message: string, meta?: Record<string, any>) {
  if (LOG_LEVELS[level] > LOG_LEVELS[currentLevel]) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  error: (msg: string, meta?: Record<string, any>) => log('error', msg, meta),
  warn: (msg: string, meta?: Record<string, any>) => log('warn', msg, meta),
  info: (msg: string, meta?: Record<string, any>) => log('info', msg, meta),
  debug: (msg: string, meta?: Record<string, any>) => log('debug', msg, meta),
};

export default logger;
