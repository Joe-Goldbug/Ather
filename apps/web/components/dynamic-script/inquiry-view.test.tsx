import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InquiryView } from './inquiry-view';

const labels = {
  intro: 'Follow-up questions',
  submit: 'Send answer',
  submitLoading: 'Sending answer…',
  placeholder: 'Write your answer',
  abort: 'Cancel',
  turnsRemaining: (count: number) => `${count} remaining`,
  errorBody: 'Request failed',
  progress: { scenario: 'Scenario', emotion: 'Emotion', background: 'Background', relationship: 'Relationship' },
};

describe('InquiryView answer loading', () => {
  it('does not crash when the API omits progress and shows a safe zero baseline', () => {
    render(
      <InquiryView
        sessionId="qa-session"
        currentQuestion="What happened?"
        progress={undefined as never}
        estimatedTurnsRemaining={3}
        submitting={false}
        error={null}
        onSubmit={() => {}}
        onAbort={() => {}}
        labels={labels}
      />,
    );

    expect(screen.getByRole('heading', { name: 'What happened?' })).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar').every((bar) => bar.getAttribute('aria-valuenow') === '0'))
      .toBe(true);
  });

  it('shows a spinner and disables the inquiry controls while submitting', () => {
    render(
      <InquiryView
        sessionId="qa-session"
        currentQuestion="What happened?"
        progress={{ scenario: 0.25, emotion: 0, background: 0, relationship: 0 }}
        estimatedTurnsRemaining={3}
        submitting
        error={null}
        onSubmit={() => {}}
        onAbort={() => {}}
        labels={labels}
      />,
    );

    const button = screen.getByRole('button', { name: 'Sending answer…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('.action-loading-spinner')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Write your answer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
