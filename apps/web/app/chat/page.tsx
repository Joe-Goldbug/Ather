'use client';

import Link from 'next/link';
import { useSession } from '@/hooks/useSession';
import { UnderstandingPanel } from '@/components/understanding/understanding-panel';

export default function ChatPage() {
  const { user, loading } = useSession();
  if (loading) return <main className="report-loading" role="status"><p>正在准备…</p></main>;
  if (!user) return <main className="report-container"><h1>和 Eva 聊聊</h1><p>登录后，可以从一件具体的事开始理解自己。</p><Link className="btn-primary" href="/login?returnTo=%2Fchat">登录后继续</Link></main>;
  return <main className="report-container">
    <header className="report-header">
      <p className="report-date">从一件具体的事开始</p>
      <h1>和 Eva 聊聊</h1>
      <p className="report-description">写下一段你想弄清的经历：发生了什么、你怎么反应、当时有什么感受。Eva 会先提出有依据的初步理解，你可以随时纠正。</p>
    </header>
    <UnderstandingPanel
      source={{ kind: 'free_entry' }}
      title="这次你想理解什么？"
      unavailableMessage="“和 Eva 聊聊”正在逐步开放。你可以先完成一次情境体验，留下这次的观察和纠正。"
    />
  </main>;
}
