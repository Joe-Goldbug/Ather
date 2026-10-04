import { useState, useEffect } from 'react';
import { authApi } from '../lib/api';

type Step = 'email' | 'otp';
type Status = 'idle' | 'loading' | 'success' | 'error';

export function useAuthMachine() {
  const [step, setStep] = useState<Step>('email');
  const [status, setStatus] = useState<Status>('idle');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const sendCode = async (targetEmail: string) => {
    setStatus('loading');
    setError(null);
    try {
      const res = await authApi.sendCode(targetEmail) as any;
      setEmail(targetEmail);
      if (res.dev_auto_login) {
        setStatus('success');
        return;
      }
      setStep('otp');
      setCountdown(300);
      setStatus('idle');
    } catch (err: any) {
      const raw = err?.message ?? '';
      const isTechnical = /internal server error|service unavailable|fetch failed|network/i.test(raw);
      setError(isTechnical ? '服务暂不可用，请稍后重试' : raw || '发送失败');
      setStatus('error');
    }
  };

  const verifyCode = async (code: string) => {
    setStatus('loading');
    setError(null);
    try {
      await authApi.verifyCode(email, code);
      setStatus('success');
    } catch (err: any) {
      const raw = err?.message ?? '';
      const isTechnical = /internal server error|service unavailable|fetch failed|network/i.test(raw);
      setError(isTechnical ? '验证失败，请稍后重试' : raw || '验证失败');
      setStatus('error');
    }
  };

  return {
    step,
    status,
    email,
    error,
    countdown,
    sendCode,
    verifyCode,
    setStep,
    setError
  };
}
