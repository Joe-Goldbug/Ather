import { beforeEach, describe, expect, it, vi } from 'vitest';
import { capturesApi, diaryApi } from './api';

describe('capturesApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes create response into a flat CaptureRecord', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        capture: {
          id: 'cap-1',
          entry_type: 'quick_fragment',
          process_mode: 'analyze',
          modality: 'text',
          raw_text: 'hello',
          mood_label: null,
          mood_intensity: null,
          local_date: '2026-06-14',
          captured_at: '2026-06-14T10:00:00.000Z',
        },
        interpretations: [
          {
            id: 'interp-1',
            dimension: 'stressResponse',
            ai_explanation: 'test',
            proposed_delta: 0.2,
            status: 'pending',
            support_count: 0,
          },
        ],
        summary: 'Summary: hello',
      }),
    } as Response);

    const capture = await capturesApi.create({
      entry_type: 'quick_fragment',
      process_mode: 'analyze',
      modality: 'text',
      raw_text: 'hello',
    });

    expect(capture).toEqual(expect.objectContaining({
      id: 'cap-1',
      entry_type: 'quick_fragment',
      process_mode: 'analyze',
      raw_text: 'hello',
      summary: 'Summary: hello',
    }));
    expect(capture.interpretations).toHaveLength(1);
  });

  it('normalizes list response into a CaptureRecord array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        captures: [
          {
            id: 'cap-2',
            entry_type: 'emotion_log',
            process_mode: 'save_only',
            modality: 'text',
            raw_text: 'mood',
            mood_label: '焦虑',
            mood_intensity: 4,
            local_date: '2026-06-14',
            captured_at: '2026-06-14T12:00:00.000Z',
          },
        ],
      }),
    } as Response);

    const captures = await capturesApi.list(10);

    expect(captures).toEqual([
      expect.objectContaining({
        id: 'cap-2',
        entry_type: 'emotion_log',
        process_mode: 'save_only',
        raw_text: 'mood',
        mood_label: '焦虑',
        mood_intensity: 4,
      }),
    ]);
    await capturesApi.list(10, 50);
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/captures?limit=10&offset=50'),
      expect.anything(),
    );
  });

  it('requests an older legacy diary page', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => [] } as Response);
    await diaryApi.recent(8, 7);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/diary/recent?limit=8&offset=7'),
      expect.anything(),
    );
  });

  it('posts a cue refutation to its capture-scoped endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    await capturesApi.refuteInterpretation('capture-1', 'cue-1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/captures/capture-1/interpretations/cue-1/refute'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
