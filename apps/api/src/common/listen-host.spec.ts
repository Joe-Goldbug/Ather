import { resolveListenHost } from './listen-host.js';

describe('resolveListenHost', () => {
  it('keeps the production-safe external bind address by default', () => {
    expect(resolveListenHost()).toBe('0.0.0.0');
  });

  it('uses an explicitly configured local verification address', () => {
    expect(resolveListenHost('127.0.0.1')).toBe('127.0.0.1');
  });

  it('treats blank configuration as unset', () => {
    expect(resolveListenHost('   ')).toBe('0.0.0.0');
  });
});
