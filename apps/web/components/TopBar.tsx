'use client';

// Ather-Solana 顶栏
//
// 相对 Ather-ethan 的改动（迁移时补齐，原项目 TopBar 只有 logo + White Paper + 语言切换，
// **没有登录入口**，导致用户找不到登录）：
//   1. 右上角按会话状态渲染「登录 / 注册」或「退出登录」
//   2. 当前所在页面的导航项高亮
//   3. 保留 Ather logo 指向首页（原项目同行为）
//
// 点击 Ather 不做登录——它只是回首页。登录入口在右上角。
// 用户提到的「点左上角 Ather 就能登录」在 Ather-ethan 里也不成立：
// `TopBar.tsx:12` 的 logo 只 `href="/"`。

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/app/providers-impl';
import { useSession } from '@/hooks/useSession';

export function TopBar() {
  const { t } = useLocale();
  const pathname = usePathname();
  const { user, isAuthed, logout } = useSession();

  const links: Array<{ href: string; label: string }> = [
    { href: '/theme-assessment', label: t('nav.assessment') },
    { href: '/play', label: t('nav.micro_sandbox') },
    { href: '/whitepaper', label: t('nav.whitepaper') },
  ];

  return (
    <header className="top-bar">
      <Link href="/" className="top-bar__logo" aria-label={t('common.brand_name')}>
        {t('common.brand_name')}
      </Link>

      <nav className="top-bar__center" aria-label="主导航">
        {links.map((link) => {
          const active = pathname === link.href || pathname?.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={active ? 'top-bar__btn top-bar__btn--active' : 'top-bar__btn'}
              aria-current={active ? 'page' : undefined}
            >
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="top-bar__right">
        {isAuthed ? (
          <>
            <span className="top-bar__user" title={user?.email}>
              {user?.email}
            </span>
            <button type="button" className="top-bar__btn" onClick={() => void logout()}>
              {t('nav.logout')}
            </button>
          </>
        ) : (
          // loading 期间也渲染登录链接：SSR 首屏必须有入口，
          // 否则 JS 加载前用户看不到任何登录线索。
          // 已登录时会在 hydrate 后自动替换为邮箱 + 退出。
          <Link
            href="/login"
            className="top-bar__btn top-bar__btn--primary"
            aria-label={t('nav.auth')}
          >
            <span>{t('nav.auth')}</span>
          </Link>
        )}
      </div>
    </header>
  );
}
