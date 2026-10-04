'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { EmailCodeAuthForm } from '@/components/email-code-auth-form';
import { useSession } from '@/hooks/useSession';
import { useLocale } from '@/app/providers-impl';
import { resolveAssessmentEntryPath } from '@/lib/assessment-entry';
import { migrateGuestAssessment } from '@/lib/guest-assessment';
import { authApi } from '@/lib/api';

function safeReturnTo(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  const [path] = value.split(/[?#]/);
  if (path.startsWith('/api') || path.startsWith('/_next')) return null;
  return value;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, refresh } = useSession();
  const { locale, t } = useLocale();
  const [redirecting, setRedirecting] = useState(false);
  const [devLoginLoading, setDevLoginLoading] = useState(false);
  const [devLoginError, setDevLoginError] = useState<string | null>(null);
  const [isLocalhost, setIsLocalhost] = useState(false);
  const redirectedRef = useRef(false);
  const returnTo = safeReturnTo(searchParams.get('returnTo'));

  useEffect(() => {
    const host = window.location.hostname;
    setIsLocalhost(host === 'localhost' || host === '127.0.0.1');
  }, []);

  async function handleDevLogin() {
    setDevLoginLoading(true);
    setDevLoginError(null);
    try {
      await authApi.devLogin();
      // [fix 2026-07-01] Force-bypass the useSession cache here. The page mount
      // probes /auth/me before the user clicks the button, so when there's no
      // cookie yet, fetchSession caches a null result. Without { force: true },
      // the post-login refresh returns that stale null, the redirect useEffect
      // never fires, and the button stays stuck on "登录中…".
      await refresh({ force: true });
    } catch (err: any) {
      setDevLoginError(err?.message ?? 'Dev login failed');
      setDevLoginLoading(false);
    }
  }

  useEffect(() => {
    if (loading || !user) return;
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    setRedirecting(true);
    // Use a full document navigation after auth so cookie-dependent pages load
    // from a clean server render instead of racing client-side RSC redirects.
    const target = returnTo ?? resolveAssessmentEntryPath(user);
    window.location.replace(target);
  }, [loading, returnTo, user]);

  if (!loading && user) {
    return (
      <main className="login-page">
        <div className="login-card">
          <div>{t('login.btn_entering')}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <EmailCodeAuthForm
          title={t('login.page_title')}
          subtitle={t('login.page_subtitle')}
          emailLabel={t('login.email_label')}
          emailInvalidText={t('login.email_invalid')}
          emailPlaceholder={t('login.email_placeholder')}
          submitText={t('login.btn_send_code')}
          resendText={t('login.btn_resend')}
          backText={t('login.btn_change_email')}
          codeTitle={t('login.code_title')}
          successText={t('login.success')}
          sendingLoadingText={t('login.sending_loading')}
          sendingToText={t('login.sending_to')}
          successSubtitle={t('login.success_subtitle')}
          onSuccess={() => {
            void migrateGuestAssessment(locale).then(() => refresh({ force: true }));
          }}
          onBack={() => {
            if (window.history.length > 1) {
              router.back();
            } else {
              router.push('/');
            }
          }}
          backButtonText={t('login.btn_back')}
        />

        {isLocalhost && (
          <div className="dev-login-block">
            <div className="dev-login-divider">
              <span>本地开发</span>
            </div>
            <button
              type="button"
              className="dev-login-btn"
              disabled={devLoginLoading}
              onClick={handleDevLogin}
            >
              {devLoginLoading ? '登录中…' : '⚡ 一键登录（跳过邮箱）'}
            </button>
            {devLoginError && <p className="dev-login-error">{devLoginError}</p>}
            <p className="dev-login-hint">
              仅在 localhost 可见。生产环境由后端拦截。
            </p>
          </div>
        )}
      </div>
      {redirecting ? <span hidden /> : null}
    </main>
  );
}
