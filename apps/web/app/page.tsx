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
            真实的自我在选择中逐渐清晰。选择一个功能，开始探索或查阅你的心智轨迹。
          </p>

          <div className="home-entry-cards">
            <Link href="/theme-assessment" className="home-entry-card home-entry-card--highlight">
              <span className="home-entry-badge">情境决策</span>
              <span className="home-entry-label">{t('nav.assessment')}</span>
              <span className="home-entry-desc">
                面对突发协作与人际冲突，在真实抉择中映照内心
              </span>
              <span className="home-entry-arrow" aria-hidden="true">进入情境 →</span>
            </Link>

            <Link href="/profile" className="home-entry-card">
              <span className="home-entry-badge">行为档案</span>
              <span className="home-entry-label">{t('nav.dashboard')}</span>
              <span className="home-entry-desc">
                查看多维性格侧写、证据链条与可验证画像
              </span>
              <span className="home-entry-arrow" aria-hidden="true">查看记录 →</span>
            </Link>

            <Link href="/daily-mirror" className="home-entry-card">
              <span className="home-entry-badge">日常心镜</span>
              <span className="home-entry-label">{t('nav.diary')}</span>
              <span className="home-entry-desc">
                核对每天的真实反应，随时与心智镜像展开对话
              </span>
              <span className="home-entry-arrow" aria-hidden="true">打开笔记 →</span>
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
