'use client';

import Link from 'next/link';
import { useLocale } from './providers-impl';
import { useSession } from '@/hooks/useSession';

export default function LandingPage() {
  const { t } = useLocale();
  const { user, isAuthed, loading } = useSession();

  if (loading) {
    return (
      <main className="container">
        <section className="hero">
          <div className="hero-loading-placeholder" aria-hidden="true" />
        </section>
      </main>
    );
  }

  const displayName =
    user?.name?.trim() ||
    user?.username?.trim() ||
    user?.display_name?.trim() ||
    (user?.email ? user.email.split('@')[0] : '') ||
    'EVA';

  if (isAuthed && user) {
    return (
      <main className="container">
        <section className="hero authed-hero">
          <h1 className="hero-brand authed-brand">
            {displayName}
          </h1>
          <p className="hero-tagline authed-tagline">
            真实的自我在选择中逐渐清晰。先来一次免费情景测试，或从页面顶部进入你的心智轨迹。
          </p>

          <div className="home-entry-cards">
            <Link href="/play" className="home-entry-card home-entry-card--banner">
              <span className="home-entry-badge">免费体验</span>
              <span className="home-entry-label">免费情景测试</span>
              <span className="home-entry-desc">
                无需登录，4-6 分钟完成一次情景模拟，立刻查看分析结果
              </span>
              <span className="home-entry-arrow" aria-hidden="true">开始体验 →</span>
            </Link>
            <Link href="/chat" className="home-entry-card home-entry-card--banner">
              <span className="home-entry-badge">从一件事开始</span>
              <span className="home-entry-label">和 Eva 聊聊</span>
              <span className="home-entry-desc">
                写下近期发生的一件事，了解自己当时的反应和感受，并随时纠正 Eva 的理解
              </span>
              <span className="home-entry-arrow" aria-hidden="true">开始聊聊 →</span>
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <section className="hero">
        <h1 className="hero-brand">{t('common.brand_name')}</h1>
        <p className="hero-tagline">{t('landing.hero_description')}</p>
        <Link href="/play" className="hero-cta">
          {t('landing.cta_assessment')}
        </Link>
      </section>
    </main>
  );
}
