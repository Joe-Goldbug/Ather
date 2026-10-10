import type { GuestAnswer, GuestOpening } from './api';

export const GUEST_CLAIM_TOKEN_KEY = 'eva_guest_claim_token';
export const GUEST_SESSION_KEY = 'eva_guest_session';

export interface GuestSessionData {
  adult_confirmed: true;
  opening: GuestOpening;
  answers: GuestAnswer[];
  pending_consequence: string | null;
}

export function saveGuestSession(data: GuestSessionData) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(data));
}

export function loadGuestSession(): GuestSessionData | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(GUEST_SESSION_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<GuestSessionData>;
    if (
      data.adult_confirmed !== true ||
      !data.opening ||
      !Array.isArray(data.opening.nodes) ||
      !Array.isArray(data.answers) ||
      (data.pending_consequence !== null && typeof data.pending_consequence !== 'string')
    ) {
      sessionStorage.removeItem(GUEST_SESSION_KEY);
      return null;
    }
    if (new Date(data.opening.expires_at).getTime() < Date.now()) {
      sessionStorage.removeItem(GUEST_SESSION_KEY);
      return null;
    }
    return data as GuestSessionData;
  } catch {
    sessionStorage.removeItem(GUEST_SESSION_KEY);
    return null;
  }
}

export function saveClaimToken(token: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(GUEST_CLAIM_TOKEN_KEY, token);
}

export function loadClaimToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(GUEST_CLAIM_TOKEN_KEY);
}

export function clearGuestData() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(GUEST_SESSION_KEY);
  sessionStorage.removeItem(GUEST_CLAIM_TOKEN_KEY);
}

export const GUEST_FEEDBACK_KEY = 'eva_guest_feedback';

export interface GuestFeedbackData {
  action: 'confirm' | 'partial' | 'dispute';
  note: string;
}

export type GuestFeedbackByObservation = Record<string, GuestFeedbackData>;

export function saveGuestFeedback(data: GuestFeedbackData) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(GUEST_FEEDBACK_KEY, JSON.stringify(data));
}

export function loadGuestFeedback(): GuestFeedbackData | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(GUEST_FEEDBACK_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (
      data &&
      (data.action === 'confirm' || data.action === 'partial' || data.action === 'dispute') &&
      typeof data.note === 'string'
    ) {
      return data as GuestFeedbackData;
    }
    sessionStorage.removeItem(GUEST_FEEDBACK_KEY);
    return null;
  } catch {
    sessionStorage.removeItem(GUEST_FEEDBACK_KEY);
    return null;
  }
}

export function clearGuestFeedback() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(GUEST_FEEDBACK_KEY);
}

export function loadGuestFeedbackByObservation(): GuestFeedbackByObservation {
  if (typeof window === 'undefined') return {};
  const raw = sessionStorage.getItem(GUEST_FEEDBACK_KEY);
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    if (value && typeof value.action === 'string') return { 'guest:overall': value as GuestFeedbackData };
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_feedback');
    const entries = Object.entries(value).flatMap(([observationId, feedback]) => {
      const item = feedback as GuestFeedbackData;
      return (item.action === 'confirm' || item.action === 'partial' || item.action === 'dispute') && typeof item.note === 'string'
        ? [[observationId, { action: item.action, note: item.note }] as const]
        : [];
    });
    return Object.fromEntries(entries) as GuestFeedbackByObservation;
  } catch {
    sessionStorage.removeItem(GUEST_FEEDBACK_KEY);
    return {};
  }
}

export function saveGuestFeedbackByObservation(feedback: GuestFeedbackByObservation) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(GUEST_FEEDBACK_KEY, JSON.stringify(feedback));
}

const MIGRATED_KEY = 'eva_guest_assessment_migrated_v1';
const ASSESSMENT_STATE_KEY = 'eva_assessment_state';

export async function migrateGuestAssessment(locale: import('./i18n').Locale): Promise<boolean> {
  void locale;
  if (typeof window === 'undefined') return false;
  if (sessionStorage.getItem(MIGRATED_KEY) === '1') return false;

  const raw = sessionStorage.getItem(ASSESSMENT_STATE_KEY);
  if (!raw) return false;

  try {
    JSON.parse(raw);
    sessionStorage.setItem(MIGRATED_KEY, '1');
    sessionStorage.removeItem(ASSESSMENT_STATE_KEY);
    return false;
  } catch {
    return false;
  }
}
