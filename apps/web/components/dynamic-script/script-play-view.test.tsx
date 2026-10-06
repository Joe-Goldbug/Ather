import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompleteDynamicSuccessResponse, ScriptScene } from '@/lib/api-dynamic-script';
import { ScriptPlayView } from './script-play-view';

afterEach(cleanup);

const labels = {
  scene: (n: number) => `Scene ${n}`,
  chooseHint: 'Choose an answer',
  progressLabel: (current: number, total: number) => `${current}/${total}`,
  submitChoice: 'Continue',
  finish: 'Finish',
};

function makeScene(n: number, nextId?: string): ScriptScene {
  return {
    scene_id: `scene-${n}`,
    scene_number: n,
    narrative: `Question ${n}`,
    choices: [{ choice_id: `choice-${n}`, text: `Answer ${n}`, dimension_signals: {}, weight: 1 }],
    next_scene_map: nextId === undefined ? {} : { [`choice-${n}`]: nextId },
  };
}

function renderPlayer(scenes: ScriptScene[]) {
  const script: CompleteDynamicSuccessResponse = {
    script_id: 'test-script',
    script: {
      template_id: 'test-template',
      scenes,
      metadata: { expected_duration_minutes: 1, dimension_coverage: [], variable_usage: {} },
    },
    psychological_narrative: '',
    validation_report: {},
    revised: false,
  };
  const onComplete = vi.fn();
  render(<ScriptPlayView script={script} onComplete={onComplete} labels={labels} />);
  return onComplete;
}

describe('ScriptPlayView terminal transitions', () => {
  it.each(['end', undefined, ''])('completes the full multi-scene path with terminal %s', (terminal) => {
    const onComplete = renderPlayer([
      makeScene(1, 'scene-2'), makeScene(2, 'scene-3'), makeScene(3, terminal),
    ]);

    for (const n of [1, 2]) {
      expect(screen.getByText(`Question ${n}`)).toBeInTheDocument();
      expect(screen.getByText(`${n}/3`)).toBeInTheDocument();
      expect(screen.getAllByRole('button')).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: `Answer ${n}` }));
      expect(onComplete).not.toHaveBeenCalled();
      expect(screen.getByText(`Question ${n + 1}`)).toBeInTheDocument();
    }

    expect(screen.getByText('3/3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Answer 3' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith([
      { sceneId: 'scene-1', choiceId: 'choice-1' },
      { sceneId: 'scene-2', choiceId: 'choice-2' },
      { sceneId: 'scene-3', choiceId: 'choice-3' },
    ]);
    expect(screen.queryByRole('heading', { name: '剧本无法继续' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finish' })).not.toBeInTheDocument();
  });

  it.each(['end', undefined, ''])('completes only once on repeated terminal clicks for %s', (terminal) => {
    const onComplete = renderPlayer([makeScene(1, terminal)]);
    const button = screen.getByRole('button', { name: 'Answer 1' });

    // Same-batch events exercise the guard before React can re-render.
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    fireEvent.click(button);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith([{ sceneId: 'scene-1', choiceId: 'choice-1' }]);
  });

  it('honors end even when unvisited scenes remain', () => {
    const onComplete = renderPlayer([makeScene(1, 'end'), makeScene(2)]);
    fireEvent.click(screen.getByRole('button', { name: 'Answer 1' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith([{ sceneId: 'scene-1', choiceId: 'choice-1' }]);
    expect(screen.queryByText('Question 2')).not.toBeInTheDocument();
  });

  it('shows an explicit error for an unknown mapped scene rather than completing', () => {
    const onComplete = renderPlayer([makeScene(1, 'missing-scene')]);
    fireEvent.click(screen.getByRole('button', { name: 'Answer 1' }));
    expect(screen.getByRole('heading', { name: '剧本无法继续' })).toBeInTheDocument();
    expect(screen.getByText('场景映射中断，请重试。')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does not silently complete an empty script', () => {
    const onComplete = renderPlayer([]);
    expect(screen.getByRole('heading', { name: '剧本无法继续' })).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
