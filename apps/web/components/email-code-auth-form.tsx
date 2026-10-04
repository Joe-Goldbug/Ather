'use client';

import { useEffect, useState } from 'react';
import { useAuthMachine } from '@/hooks/useAuthMachine';

type Props = {
  title?: string;
  subtitle?: string;
  emailLabel?: string;
  emailInvalidText?: string;
  emailPlaceholder?: string;
  submitText?: string;
  resendText?: string;
  backText?: string;
  codeTitle?: string;
  onSuccess?: () => void;
  onBack?: () => void;
  successText?: string;
  sendingLoadingText?: string;
  sendingToText?: string;
  backButtonText?: string;
  successSubtitle?: string;
};

export function EmailCodeAuthForm({
  title = '',
  subtitle = '',
  emailLabel = '',
  emailInvalidText = '',
  emailPlaceholder = 'your@email.com',
  submitText = '',
  resendText = '',
  backText = '',
  codeTitle = '',
  onSuccess,
  onBack,
  successText = '',
  sendingLoadingText = '',
  sendingToText = '',
  backButtonText = '',
  successSubtitle = '',
}: Props) {
  const [emailInput, setEmailInput] = useState('');
  const [emailInvalid, setEmailInvalid] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const { step, status, error, countdown, sendCode, verifyCode, setStep, setError } = useAuthMachine();

  useEffect(() => {
    if (status === 'success') {
      onSuccess?.();
    }
  }, [status, onSuccess]);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    const email = emailInput.trim();
    if (!email) return;
    if (!email.includes('@')) {
      setEmailInvalid(emailInvalidText);
      return;
    }
    setEmailInvalid('');
    await sendCode(email);
  }

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    setEmailInput(e.target.value);
    if (emailInvalid && e.target.value.includes('@')) {
      setEmailInvalid('');
    }
  }

  async function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCodeInput(value);

    if (value.length === 6) {
      await verifyCode(value);
    }
  }

  if (status === 'success') {
    return (
      <div className="auth-card sketch-box auth-done">
        <p className="auth-done-title">{successText}</p>
        <p className="auth-done-subtitle">{successSubtitle}</p>
      </div>
    );
  }

  return (
    <div className="auth-card sketch-box">
      {title && <h2 className="auth-title">{title}</h2>}
      {subtitle && <p className="auth-subtitle">{subtitle}</p>}

      {step === 'email' ? (
        <form onSubmit={handleSendCode} className="auth-form">
          <label className="auth-label">
            {emailLabel}
            <input
              type="text"
              inputMode="email"
              placeholder={emailPlaceholder}
              value={emailInput}
              onChange={handleEmailChange}
              autoFocus
              disabled={status === 'loading'}
            />
          </label>
          {(emailInvalid || error) && <p className="auth-error">{emailInvalid || error}</p>}
          <div className="auth-actions">
            <button type="submit" disabled={status === 'loading' || !emailInput.trim()}>
              {status === 'loading' ? sendingLoadingText : submitText}
            </button>
            <button type="button" className="secondary" onClick={onBack}>
              {backButtonText}
            </button>
          </div>
        </form>
      ) : (
        <div className="auth-form">
          <div className="auth-email-line">{sendingToText.replace('{email}', emailInput)}</div>
          <label className="auth-label">
            {codeTitle}
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="000000"
              value={codeInput}
              onChange={handleCodeChange}
              required
              autoFocus
              disabled={status === 'loading'}
              className="auth-code-input"
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <div className="auth-actions">
            <button
              type="button"
              className="secondary"
              disabled={countdown > 0 || status === 'loading'}
              onClick={() => sendCode(emailInput)}
            >
              {countdown > 0 ? `${resendText} (${countdown}s)` : resendText}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={status === 'loading'}
              onClick={() => {
                setStep('email');
                setCodeInput('');
                setError(null);
              }}
            >
              {backText}
            </button>
          </div>
        </div>
      )}

      <style>{`
        .auth-card {
          width: 100%;
          max-width: 420px;
          background: var(--surface);
          border: 1px solid var(--border-light);
          border-radius: 4px;
          padding: clamp(1.5rem, 4vw, 2.25rem);
        }
        .auth-title {
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 0.25rem;
          letter-spacing: -0.01em;
        }
        .auth-subtitle {
          color: var(--text-secondary);
          margin-bottom: 1.5rem;
          line-height: 1.6;
          font-size: 0.94rem;
        }
        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .auth-label {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          font-size: 0.88rem;
          font-weight: 500;
          color: var(--foreground);
          letter-spacing: -0.005em;
        }
        .auth-label input {
          background: var(--surface-muted);
          border: 1px solid var(--border-light);
          border-radius: 4px;
          padding: 0.85rem 1rem;
          font-size: 1rem;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .auth-label input:focus {
          outline: none;
          border-color: var(--brand-black);
        }
        .auth-email-line {
          color: var(--text-secondary);
          font-size: 0.92rem;
        }
        .auth-code-input {
          letter-spacing: 0.35rem;
          text-align: center;
          font-size: 1.5rem;
          font-weight: 700;
        }
        .auth-error {
          color: #c62828;
          font-size: 0.85rem;
          margin: -0.25rem 0;
        }
        .auth-actions {
          display: flex;
          gap: 0.75rem;
          margin-top: 0.25rem;
        }
        .auth-actions button {
          flex: 1;
          min-width: 0;
          border-radius: 4px;
          font-size: 0.95rem;
        }
        .auth-actions button:first-child {
          flex: 1.2;
        }
        .auth-done {
          text-align: center;
          padding: 1rem 0;
        }
        .auth-done-title {
          font-weight: 700;
          font-size: 1.15rem;
          margin-bottom: 0.3rem;
        }
        .auth-done-subtitle {
          color: var(--text-secondary);
          font-size: 0.92rem;
        }
        @media (max-width: 767px) {
          .auth-card {
            max-width: none;
            border-radius: 4px;
            padding: 1.5rem;
          }
          .auth-actions {
            flex-direction: row;
          }
        }
      `}</style>
    </div>
  );
}
