'use client';

import { useEffect, useState } from 'react';
import { understandingApi, type UnderstandingOutput, type UnderstandingSession, type UnderstandingSourceRef, type UnderstandingTurn } from '@/lib/api';

function operationId() {
  return crypto.randomUUID?.() ?? `understanding-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function Output({ output }: { output: UnderstandingOutput }) {
  if (output.kind !== 'understanding') return <p>{output.text}</p>;
  return <div className="understanding-output">
    <p>{output.reaction.text}</p>
    {output.possible_meaning && <p>{output.possible_meaning.text}</p>}
    <p className="report-detail">{output.uncertainty}</p>
    {output.change && <p className="report-detail">已根据你的纠正更新：{output.change.text}</p>}
  </div>;
}

export function UnderstandingPanel({ source, title = '和 Eva 聊聊', intro, unavailableMessage }: {
  source: UnderstandingSourceRef;
  title?: string;
  intro?: string;
  unavailableMessage?: string;
}) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [session, setSession] = useState<UnderstandingSession | null>(null);
  const [draft, setDraft] = useState('');
  const [consent, setConsent] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void understandingApi.capabilities().then((value) => {
      if (live) setAvailable(source.kind === 'free_entry' ? value.home_chat : value.result_followup);
    }).catch(() => { if (live) setAvailable(false); });
    return () => { live = false; };
  }, [source.kind]);

  if (available !== true) {
    return available === false && unavailableMessage ? <p className="report-detail">{unavailableMessage}</p> : null;
  }
  const turns = session?.turns ?? [];
  const latestUnderstanding = [...turns].reverse().find((turn) => turn.output?.kind === 'understanding');

  async function start() {
    if (!consent) { setError('请先确认：只用这次选择的内容和你的补充来生成理解。'); return; }
    setWorking(true); setError('');
    try {
      const created = await understandingApi.create({ operation_id: operationId(), source_ref: source, processing_consent: true });
      setSession(created);
    } catch (err) { setError(err instanceof Error ? err.message : '暂时无法开始。'); }
    finally { setWorking(false); }
  }

  async function send(action: 'message' | 'correction', parentTurn?: UnderstandingTurn) {
    if (!session || !draft.trim()) return;
    setWorking(true); setError('');
    try {
      const pending = await understandingApi.append(session.id, {
        operation_id: operationId(), expected_version: session.version, action, text: draft.trim(),
        ...(parentTurn ? { parent_turn_id: parentTurn.id } : {}),
      });
      const generated = await understandingApi.generate(session.id, pending.id);
      const refreshed = await understandingApi.get(session.id);
      setSession({ ...refreshed, turns: refreshed.turns?.map((turn) => turn.id === generated.id ? generated : turn) });
      setDraft('');
    } catch (err) { setError(err instanceof Error ? err.message : '暂时无法生成这次理解。'); }
    finally { setWorking(false); }
  }

  async function save() {
    if (!session) return;
    setWorking(true); setError('');
    try { setSession(await understandingApi.state(session.id, 'save')); }
    catch (err) { setError(err instanceof Error ? err.message : '暂时无法保存。'); }
    finally { setWorking(false); }
  }

  return <section className="report-section understanding-panel" aria-label={title}>
    <h2>{title}</h2>
    {!session ? <>
      <p>{intro ?? '写下这次最想弄清的一件事。Eva 只会结合这条观察和你的补充，给出可以纠正的初步理解。'}</p>
      <label className="understanding-consent">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        我同意 Eva 仅为这次对话处理我写下的内容；我可以随时停止、撤回或删除。
      </label>
      <div className="report-actions"><button type="button" disabled={working} onClick={start}>{working ? '正在开始…' : '开始聊这件事'}</button></div>
    </> : <>
      <p className="report-detail">这是一段只围绕当前事件的对话。你可以补充、纠正，或在任何时候停止。</p>
      {turns.map((turn) => <div key={turn.id} className="understanding-turn">
        {turn.text && <p><strong>{turn.action === 'correction' ? '你的纠正：' : '你：'}</strong>{turn.text}</p>}
        {turn.output && <Output output={turn.output} />}
      </div>)}
      <label className="supplement-input-label" htmlFor={`understanding-${session.id}`}>现在最想让 Eva 帮你理解什么？</label>
      <textarea id={`understanding-${session.id}`} className="supplement-textarea" value={draft}
        maxLength={2000} rows={4} disabled={working} onChange={(event) => setDraft(event.target.value)}
        placeholder="写下发生了什么、你当时怎样反应或感受；也可以指出刚才哪里不符合。" />
      <div className="report-actions">
        <button type="button" disabled={working || !draft.trim()} onClick={() => send('message')}>{working ? '正在理解…' : '请 Eva 帮我理解'}</button>
        {latestUnderstanding && <button type="button" disabled={working || !draft.trim()} onClick={() => send('correction', latestUnderstanding)}>纠正刚才的理解</button>}
        {session.capabilities.can_save && <button type="button" disabled={working} onClick={save}>保存这次理解</button>}
      </div>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
