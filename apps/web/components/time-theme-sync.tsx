'use client';

import { useEffect } from 'react';

const DAY_START_HOUR = 6;
const NIGHT_START_HOUR = 18;

function getThemeForHour(hour: number): 'light' | 'dark' {
  return hour >= DAY_START_HOUR && hour < NIGHT_START_HOUR ? 'light' : 'dark';
}

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function getDelayUntilNextSwitch(now: Date): number {
  const next = new Date(now);
  const hour = now.getHours();

  if (hour < DAY_START_HOUR) {
    next.setHours(DAY_START_HOUR, 0, 0, 0);
  } else if (hour < NIGHT_START_HOUR) {
    next.setHours(NIGHT_START_HOUR, 0, 0, 0);
  } else {
    next.setDate(next.getDate() + 1);
    next.setHours(DAY_START_HOUR, 0, 0, 0);
  }

  return Math.max(1000, next.getTime() - now.getTime());
}

export function TimeThemeSync() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const syncTheme = () => {
      const now = new Date();
      applyTheme(getThemeForHour(now.getHours()));
      timer = setTimeout(syncTheme, getDelayUntilNextSwitch(now));
    };

    syncTheme();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}
