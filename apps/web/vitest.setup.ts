import '@testing-library/jest-dom';
import React from 'react';
import { vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => React.createElement('a', { href, ...rest }, children),
}));

vi.mock('lucide-react', () => {
  const cache = new Map<string, any>();
  const getIcon = (name: string) => {
    if (!cache.has(name)) {
      const Icon = (props: any) => React.createElement('span', { 'data-icon': name, ...props });
      Icon.displayName = name;
      cache.set(name, Icon);
    }
    return cache.get(name);
  };

  return new Proxy({ __esModule: true }, {
    get: (_, name) => {
      if (name === '__esModule') return true;
      if (name === 'then' || typeof name === 'symbol') return undefined;
      return getIcon(String(name));
    },
    has: (_, name) => {
      if (name === 'then') return false;
      return true;
    },
    getOwnPropertyDescriptor: (_, name) => {
      if (name === 'then') return undefined;
      return {
        configurable: true,
        enumerable: true,
        value: name === '__esModule' ? true : getIcon(String(name)),
        writable: true,
      };
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
