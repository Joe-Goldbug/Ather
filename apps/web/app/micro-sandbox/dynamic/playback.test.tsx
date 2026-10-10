import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DynamicScriptPage from './page';

const api = vi.hoisted(() => ({ getStatus: vi.fn(), getScriptStatus: vi.fn(), getScriptResult: vi.fn(), submitPlayback: vi.fn() }));
vi.mock('@/lib/api-dynamic-script', () => ({ dynamicScriptApi: api }));
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ user: { id: 'synthetic' }, loading: false }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../../providers-impl', async () => {
  const { messages } = await import('../../../messages/index');
  return { useLocale: () => ({ locale: 'en', t: (key: string) => {
    const [section, name] = key.split('.');
    return (messages.en as unknown as Record<string, Record<string, string>>)[section]?.[name] ?? key;
  } }) };
});
const path = [{ scene_id: 's1', choice_id: 'c1' }, { scene_id: 's2', choice_id: 'c2' }];
const script = {
  script_id: 'script-1', psychological_narrative: 'Synthetic result', revised: false, validation_report: {},
  script: { template_id: 'synthetic', metadata: { expected_duration_minutes: 1, dimension_coverage: [], variable_usage: {} },
    scenes: [1, 2].map(n => ({ scene_id: `s${n}`, scene_number: n, narrative: `Question ${n}`,
      choices: [{ choice_id: `c${n}`, text: `Answer ${n}`, dimension_signals: {}, weight: 1 }],
      next_scene_map: { [`c${n}`]: n === 1 ? 's2' : 'end' } })) },
};

beforeEach(() => {
  vi.resetAllMocks();
  window.sessionStorage.setItem('eva:dynamic-script:session-id', 'session-1');
  api.getStatus.mockResolvedValue({ status: 'completed', generation_status: 'ready', script_generation_id: 'gen-1' });
  api.getScriptStatus.mockResolvedValue({ status: 'ready', progress_percentage: 100 });
  api.getScriptResult.mockResolvedValue(script);
});
afterEach(() => { cleanup(); window.sessionStorage.clear(); });

describe('dynamic playback page integration', () => {
  async function answerBoth() {
    render(<DynamicScriptPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Answer 1' }));
    expect(api.submitPlayback).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Answer 2' }));
  }

  it('advances directly and waits for a durable final save before showing the result', async () => {
    let resolve!: (value: unknown) => void;
    api.submitPlayback.mockReturnValue(new Promise(r => { resolve = r; }));
    await answerBoth();
    expect(api.submitPlayback).toHaveBeenCalledWith('script-1', path);
    expect(screen.getByText('Saving your assessment…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Answer 2' })).toBeDisabled();
    expect(screen.queryByText('Synthetic result')).not.toBeInTheDocument();
    api.getScriptResult.mockResolvedValueOnce({ ...script, played_path: path, observations: [{ id: 's1:c1', title: '这次你的回应', text: '你的回应来自实际作答', question: '这像你吗？', evidence: { scene_id: 's1', choice_id: 'c1', situation: 'Question 1', choice_text: 'Answer 1' } }] });
    await act(async () => { resolve({ script_id: 'script-1', played_path: path, completed: true, replayed: false }); });
    expect(await screen.findByText('Synthetic result')).toBeInTheDocument();
  });

  it('retries the exact selected path without making the user answer again', async () => {
    api.submitPlayback.mockRejectedValueOnce(new Error('synthetic save failure'));
    await answerBoth();
    expect(await screen.findByRole('alert')).toHaveTextContent('synthetic save failure');
    expect(screen.queryByText('Synthetic result')).not.toBeInTheDocument();
    api.submitPlayback.mockResolvedValueOnce({ script_id: 'script-1', played_path: path, completed: true, replayed: true });
    api.getScriptResult.mockResolvedValueOnce({ ...script, played_path: path, observations: [{ id: 's1:c1', title: '这次你的回应', text: '你的回应来自实际作答', question: '这像你吗？', evidence: { scene_id: 's1', choice_id: 'c1', situation: 'Question 1', choice_text: 'Answer 1' } }] });
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
    expect(await screen.findByText('Synthetic result')).toBeInTheDocument();
    expect(api.submitPlayback).toHaveBeenLastCalledWith('script-1', path);
  });

  it('does not show observations returned for a different saved path', async () => {
    api.submitPlayback.mockResolvedValue({ script_id: 'script-1', played_path: path, completed: true, replayed: false });
    render(<DynamicScriptPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Answer 1' }));
    api.getScriptResult.mockResolvedValueOnce({ ...script, played_path: [{ scene_id: 's1', choice_id: 'other' }] });
    fireEvent.click(await screen.findByRole('button', { name: 'Answer 2' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Saved observations do not match your answers');
    expect(screen.queryByText('Synthetic result')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry save' })).toBeInTheDocument();
  });
});
