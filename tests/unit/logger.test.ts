import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { log, setLogLevel } from '../../src/utils/logger.js';

let spy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  spy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  setLogLevel('info');
  spy.mockRestore();
});

describe('setLogLevel', () => {
  it('changes current level so debug messages are emitted', () => {
    setLogLevel('debug');
    log.debug('test');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('level filtering', () => {
  it('level "error" suppresses debug, info, warn, and success', () => {
    setLogLevel('error');
    log.debug('d');
    log.info('i');
    log.success('s');
    log.warn('w');
    expect(spy).not.toHaveBeenCalled();

    log.error('e');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('level "debug" allows all five methods', () => {
    setLogLevel('debug');
    log.debug('d');
    log.info('i');
    log.success('s');
    log.warn('w');
    log.error('e');
    expect(spy).toHaveBeenCalledTimes(5);
  });

  it('level "warn" allows warn and error only', () => {
    setLogLevel('warn');
    log.debug('d');
    log.info('i');
    log.success('s');
    log.warn('w');
    log.error('e');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('level "info" (default) allows info, success, warn, and error', () => {
    setLogLevel('info');
    log.debug('d');
    log.info('i');
    log.success('s');
    log.warn('w');
    log.error('e');
    expect(spy).toHaveBeenCalledTimes(4);
  });
});

describe('log.success uses info threshold', () => {
  it('is suppressed at warn level', () => {
    setLogLevel('warn');
    log.success('s');
    expect(spy).not.toHaveBeenCalled();
  });

  it('is emitted at info level', () => {
    setLogLevel('info');
    log.success('s');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('all methods write to stderr', () => {
  it('every method calls console.error (not console.log)', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setLogLevel('debug');

    log.debug('d');
    log.info('i');
    log.success('s');
    log.warn('w');
    log.error('e');

    expect(spy).toHaveBeenCalledTimes(5);
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
