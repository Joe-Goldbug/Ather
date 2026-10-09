import '@testing-library/jest-dom';
import React from 'react';
import { vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => React.createElement('a', { href, ...rest }, children),
}));

vi.mock('lucide-react', () => {
  return new Proxy({}, {
    get: (_, name) => {
      const Icon = (props: any) => React.createElement('span', { 'data-icon': String(name), ...props });
      Icon.displayName = String(name);
      return Icon;
    },
  });
});

type StorageMap = Map<string, string>;

function createMemoryStorage() {
  const store: StorageMap = new Map();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value));
    },
  } satisfies Storage;
}

function ensureStorage(name: 'localStorage' | 'sessionStorage') {
  const storage = createMemoryStorage();
  try {
    Object.defineProperty(globalThis, name, {
      value: storage,
      configurable: true,
      writable: true,
    });
  } catch {}
  if (typeof window !== 'undefined') {
    try {
      Object.defineProperty(window, name, {
        value: storage,
        configurable: true,
        writable: true,
      });
    } catch {}
  }
}

ensureStorage('localStorage');
ensureStorage('sessionStorage');
