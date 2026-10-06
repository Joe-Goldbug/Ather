// scripts/test-real-llm.ts
// 直接调 real llm + 测 <think> 剥离解析
import { buildDynamicScriptPrompt } from '../packages/core/dist/src/dialogue/prompts.js';

const BASE_URL = (process.env.LLM_BASE_URL || 'https://api.deepseek.com');
const API_KEY = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '';
const MODEL = process.env.LLM_MODEL || 'deepseek-v4-flash';

const vector = {
  trust_threshold: 0.5, boundary_strength: 0.5,
  conflict_style: 'balanced', conflict_score: 0.5,
  attachment_pattern: 'secure', attachment_score: 0.5,
  emotional_regulation: 'reflective',
  stress_response: 'adaptive', stress_score: 0.5,
  achievement_drive: 'internalized', perfectionism_score: 0.5,
  selfview_pattern: 'realistic', selfview_score: 0.5, growth_mindset_score: 0.5,
  social_energy: 'selective', social_energy_score: 0.5,
  confidence: {
    trust: 0.5, conflict: 0.5, attachment: 0.5, emotion: 0.5,
    stress: 0.5, achievement: 0.5, selfview: 0.5, socialenergy: 0.5,
  },
} as any;

async function main() {
  const systemPrompt = buildDynamicScriptPrompt(vector, [], 'zh-CN');
  const system = systemPrompt.system;
  const userMsg = 'Generate exactly 1 new scenario question. Output JSON only, no explanation.';

  console.log('Calling LLM (DeepSeek-V4-Flash) ...');
  const url = BASE_URL.replace(/\/$/, '') + '/chat/completions';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }],
      max_tokens: 2000,
      temperature: 0.65,
    }),
  });

  if (!resp.ok) {
    console.error(`LLM API error ${resp.status}:`, await resp.text().catch(() => ''));
    process.exit(1);
  }

  const data = await resp.json() as any;
  const raw = data.choices[0].message.content as string;
  console.log(`Raw length: ${raw.length}, has <think>: ${raw.includes('<think>')}, has </think>: ${raw.includes('</think>')}`);
  console.log('--- raw first 600 ---');
  console.log(raw.slice(0, 600));
  console.log('--- raw last 200 ---');
  console.log(raw.slice(-200));

  // Now apply the fix
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
  const thinkStart = cleaned.indexOf('<think>');
  if (thinkStart !== -1) {
    const after = cleaned.slice(thinkStart);
    const codeBlock = after.indexOf('```');
    const jsonStart = after.search(/[\[{]/);
    let cutAt = after.length;
    if (codeBlock !== -1) cutAt = Math.min(cutAt, codeBlock);
    if (jsonStart !== -1) cutAt = Math.min(cutAt, jsonStart);
    cleaned = cleaned.slice(0, thinkStart) + after.slice(cutAt);
  }
  cleaned = cleaned.trim();
  console.log('\n--- cleaned first 300 ---');
  console.log(cleaned.slice(0, 300));

  let jsonStr = cleaned;
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1];
    console.log('✅ found markdown code block');
  }

  const startIdx = jsonStr.indexOf('[');
  const endIdx = jsonStr.lastIndexOf(']');
  if (startIdx === -1 || endIdx === -1) {
    console.error('❌ No JSON array detected!');
    console.log('jsonStr first 500:', jsonStr.slice(0, 500));
    process.exit(1);
  }

  jsonStr = jsonStr.slice(startIdx, endIdx + 1);
  const parsed = JSON.parse(jsonStr);
  console.log('✅ Parsed! id:', parsed[0]?.id, 'title:', parsed[0]?.title?.slice(0, 40));
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
