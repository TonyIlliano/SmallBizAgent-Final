import { describe, it, expect, vi } from 'vitest';
import { logger } from './logger';

describe('logger', () => {
  it('has all log level methods', () => {
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('logs info messages to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('test message');
    expect(spy).toHaveBeenCalled();
    const logged = JSON.parse(spy.mock.calls[0][0]);
    expect(logged.level).toBe('info');
    expect(logged.message).toBe('test message');
    expect(logged.timestamp).toBeDefined();
    spy.mockRestore();
  });

  it('logs error messages to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('test error', { code: 500 });
    expect(spy).toHaveBeenCalled();
    const logged = JSON.parse(spy.mock.calls[0][0]);
    expect(logged.level).toBe('error');
    expect(logged.message).toBe('test error');
    expect(logged.code).toBe(500);
    spy.mockRestore();
  });
});
