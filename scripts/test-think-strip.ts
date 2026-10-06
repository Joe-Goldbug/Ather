// scripts/test-think-strip.ts
import { generateDynamicScenarios } from '../packages/core/dist/src/assessment/script-engine.js';

const BACKTICK = String.fromCharCode(96);

const case1 =
  '<think>The user wants me to generate a micro-sandbox scenario. Let me think about the dimensions.\n\nThe user has trust_threshold 0.65. I will center on trust.\n\nLet me draft a scenario.</mm:think>' +
  BACKTICK + BACKTICK + BACKTICK + 'json\n' +
  '[\n' +
  '  {\n' +
  '    "id": "eva_sandbox_0047",\n' +
  '    "title": "test",\n' +
  '    "setup": "A close work friend invites you to dinner.",\n' +
  '    "prompt": "You have been put on the spot. How do you respond?",\n' +
  '    "options": {\n' +
  '      "A": { "text": "Open up", "label": "A", "feedback": "F" },\n' +
  '      "B": { "text": "Deflect", "label": "B", "feedback": "F" },\n' +
  '      "C": { "text": "Set boundary", "label": "C", "feedback": "F" },\n' +
  '      "D": { "text": "Stay silent", "label": "D", "feedback": "F" }\n' +
  '    },\n' +
  '    "vector_patch": {\n' +
  '      "A": { "trust_threshold": 0.01 },\n' +
  '      "B": { "trust_threshold": 0.02 },\n' +
  '      "C": { "trust_threshold": 0.03 },\n' +
  '      "D": { "trust_threshold": 0.04 }\n' +
  '    }\n' +
  '  }\n' +
  ']\n' +
  BACKTICK + BACKTICK + BACKTICK;

const case2 = '<think>thinking...let me make a scenario. The user has trust 0.5. Let me design.\n\nOK scenario is...\n\nWait actually...\n\nLet me think more carefully. I need to consider all dimensions and produce a high-quality output. The user has many dimensions to consider. The most important is trust. The scenario should test trust in a high-pressure way. Let me draft something.\n\nScenario: A close friend reveals something personal. You are at a public gathering. How do you respond?\n\nOptions should be A B C D covering different responses.\n\nLet me write it out. The setup is: 30 characters of immersive scene. Prompt is a question. Options are A B C D.\n\nNow I need to write the JSON. Let me format it as strict JSON array.\n\nActually let me think about whether to use markdown code block or raw JSON. The instructions say output strict JSON array. So I should just output the JSON directly without markdown.\n\nBut wait, the system prompt says "Output strict JSON array containing exactly 1 object". So I should output the array directly.\n\nLet me write it now.\n\n```json\n[\n  {\n    "id": "truncated_001",\n    "title": "测试",\n    "setup": "测试场景。这是测试用的场景。';

const case3 =
  BACKTICK + BACKTICK + BACKTICK + 'json\n' +
  '[\n' +
  '  {\n' +
  '    "id": "direct_001",\n' +
  '    "title": "直接输出",\n' +
  '    "setup": "没有 think 块",\n' +
  '    "prompt": "怎么办？",\n' +
  '    "options": {\n' +
  '      "A": { "text": "选项 A", "label": "A", "feedback": "F" },\n' +
  '      "B": { "text": "选项 B", "label": "B", "feedback": "F" },\n' +
  '      "C": { "text": "选项 C", "label": "C", "feedback": "F" },\n' +
  '      "D": { "text": "选项 D", "label": "D", "feedback": "F" }\n' +
  '    },\n' +
  '    "vector_patch": {\n' +
  '      "A": { "trust_threshold": 0 },\n' +
  '      "B": { "trust_threshold": 0 },\n' +
  '      "C": { "trust_threshold": 0 },\n' +
  '      "D": { "trust_threshold": 0 }\n' +
  '    }\n' +
  '  }\n' +
  ']\n' +
  BACKTICK + BACKTICK + BACKTICK;

const cases = [
  { name: 'think + markdown (real deepseek-v4-flash shape)', raw: case1 },
  { name: 'truncated at max_tokens', raw: case2 },
  { name: 'no think, just markdown', raw: case3 },
];

async function main() {
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
  const diaries: any[] = [];

  for (const c of cases) {
    const llm = async () => c.raw;
    try {
      const result = await generateDynamicScenarios(vector, diaries, llm, 'zh-CN');
      console.log(`✅ ${c.name} — id=${result[0].id}, title="${result[0].title}"`);
    } catch (err: any) {
      console.log(`❌ ${c.name} — ${err.message}`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
