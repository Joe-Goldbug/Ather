'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Globe,
  Languages,
  LogIn,
  LogOut,
  User,
  UserPlus,
  UserCircle,
  UserCircle2,
  Compass,
  Scan,
  Settings2,
  Sparkles,
  AtSign,
  KeyRound,
  Lock,
  Shell,
} from 'lucide-react';

const ALL_ICONS = [
  { name: 'Globe', Component: Globe, label: 'Globe（当前语言）' },
  { name: 'Languages', Component: Languages, label: 'Languages（语言）' },
  { name: 'LogIn', Component: LogIn, label: 'LogIn（登录入口）' },
  { name: 'LogOut', Component: LogOut, label: 'LogOut（登出）' },
  { name: 'User', Component: User, label: 'User（用户）' },
  { name: 'UserPlus', Component: UserPlus, label: 'UserPlus（注册）' },
  { name: 'UserCircle', Component: UserCircle, label: 'UserCircle（用户）' },
  { name: 'UserCircle2', Component: UserCircle2, label: 'UserCircle2（用户）' },
  { name: 'Compass', Component: Compass, label: 'Compass（探索）' },
  { name: 'Scan', Component: Scan, label: 'Scan（扫描/发现）' },
  { name: 'Settings2', Component: Settings2, label: 'Settings2（设置）' },
  { name: 'Sparkles', Component: Sparkles, label: 'Sparkles（AI/魔法）' },
  { name: 'AtSign', Component: AtSign, label: 'AtSign（@符号）' },
  { name: 'KeyRound', Component: KeyRound, label: 'KeyRound（钥匙）' },
  { name: 'Lock', Component: Lock, label: 'Lock（锁）' },
  { name: 'Shell', Component: Shell, label: 'Shell（EVA 贝壳）' },
];

export default function IconDemoPage() {
  const router = useRouter();

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      router.replace('/');
    }
  }, [router]);

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <main className="icon-demo-page">
      <div className="icon-demo-container">
        <h1 className="icon-demo-title">
          替换 Globe 的候选图标
        </h1>
        <p className="icon-demo-subtitle">
          点击图标可直接复制代码到 GlobalLanguageSwitcher.tsx 使用
        </p>
        <div className="icon-demo-grid">
          {ALL_ICONS.map(({ name, Component, label }) => (
            <button
              key={name}
              type="button"
              className="icon-demo-btn"
              onClick={() => {
                navigator.clipboard.writeText(`import { ${name} } from 'lucide-react';`);
                const el = document.getElementById(`copy-${name}`);
                if (el) {
                  el.textContent = '已复制!';
                  setTimeout(() => { el.textContent = '点我复制'; }, 1500);
                }
              }}
            >
              <Component size={32} strokeWidth={1.75} />
              <span className="icon-demo-btn-label">{label}</span>
              <span
                id={`copy-${name}`}
                className="icon-demo-btn-copy"
              >
                点我复制
              </span>
            </button>
          ))}
        </div>
        <div className="icon-demo-panel">
          <h2 className="icon-demo-panel-title">
            推荐用于语言切换的图标：
          </h2>
          <div className="icon-demo-panel-row">
            {[
              { name: 'Globe', Component: Globe },
              { name: 'Languages', Component: Languages },
              { name: 'Shell', Component: Shell },
            ].map(({ name, Component }) => (
              <div
                key={name}
                className="icon-demo-panel-item"
              >
                <Component size={20} strokeWidth={1.75} />
                <span className="icon-demo-panel-item-label">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
