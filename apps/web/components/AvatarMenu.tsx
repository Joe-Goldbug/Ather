// apps/web/components/AvatarMenu.tsx
// TopBar 右侧的统一账户入口：未登录时弹出「游戏登录 / 钱包登录」两种方式；
// 登录后（邮箱 session 或钱包连接任一）展示身份信息与退出/断开操作。
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useLocale } from '@/app/providers-impl';
import { useSession } from '@/hooks/useSession';

const isTest =
  typeof process !== 'undefined' &&
  (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST));

/** 钱包相关的菜单项：独立组件以隔离 wagmi hooks（测试环境整体 mock）。 */
function WalletMenuItems({
  onConnected,
}: {
  onConnected?: () => void;
}) {
  const { t } = useLocale();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`;
    return (
      <>
        <div className="avatar-menu__meta" data-testid="wallet-meta">
          <span className="avatar-menu__meta-label">Base</span>
          <span className="avatar-menu__meta-value">{shortAddr}</span>
        </div>
        <button
          type="button"
          className="avatar-menu__item"
          onClick={() => disconnect()}
        >
          {t('nav.wallet_disconnect')}
        </button>
      </>
    );
  }

  const cbConnector =
    connectors.find((c) => c.id === 'coinbaseWalletSDK') || connectors[0];

  return (
    <button
      type="button"
      className="avatar-menu__item"
      disabled={isPending}
      data-testid="wallet-login"
      onClick={() => {
        if (cbConnector) {
          connect({ connector: cbConnector });
          onConnected?.();
        }
      }}
    >
      {isPending ? t('nav.wallet_connecting') : t('nav.wallet_login')}
    </button>
  );
}

function TestWalletMenuItems({ onConnected }: { onConnected?: () => void }) {
  const { t } = useLocale();
  return (
    <button type="button" className="avatar-menu__item" data-testid="wallet-login">
      {t('nav.wallet_login')}
    </button>
  );
}

const WalletItems = isTest ? TestWalletMenuItems : WalletMenuItems;

export function AvatarMenu() {
  const { t } = useLocale();
  const { user, logout } = useSession();
  let router: ReturnType<typeof useRouter> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    router = useRouter();
  } catch {
    router = null;
  }
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  const email = user?.email ?? '';
  const displayName =
    user?.name?.trim() ||
    user?.username?.trim() ||
    user?.display_name?.trim() ||
    (email ? email.split('@')[0] : '') ||
    'EVA';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div
      ref={wrapRef}
      className="avatar-menu-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="avatar-button"
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : undefined}
        aria-label={user ? displayName : t('nav.account')}
        data-testid="avatar-button"
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          className="avatar-button__icon"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden="true"
        >
          <circle cx="12" cy="8" r="4" fill="currentColor" />
          <path
            d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        {user && (
          <span
            className="avatar-button__dot"
            aria-hidden="true"
            title={displayName}
          />
        )}
      </button>

      <div
        className="avatar-menu"
        role={open ? 'menu' : undefined}
        data-open={open ? 'true' : 'false'}
        aria-hidden={!open}
      >
        {user && (
          <div className="avatar-menu__meta" data-testid="account-meta">
            <span className="avatar-menu__meta-label">{displayName}</span>
            {email && <span className="avatar-menu__meta-value">{email}</span>}
          </div>
        )}

        {!user && (
          <button
            type="button"
            className="avatar-menu__item"
            role="menuitem"
            data-testid="email-login"
            onClick={() => {
              setOpen(false);
              if (router) {
                router.push('/login?returnTo=%2F');
              } else if (typeof window !== 'undefined') {
                window.location.assign('/login?returnTo=%2F');
              }
            }}
          >
            {t('nav.email_login')}
          </button>
        )}

        <WalletItems onConnected={() => setOpen(false)} />

        {user && (
          <button
            type="button"
            className="avatar-menu__item"
            role="menuitem"
            data-testid="logout"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
          >
            {t('nav.logout')}
          </button>
        )}
      </div>
    </div>
  );
}
