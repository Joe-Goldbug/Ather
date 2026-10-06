import { buildEntityJson } from './fixtures/entity.fixture.js';
import { buildReportJson } from './fixtures/report.fixture.js';
import { buildScenarioJson } from './fixtures/scenario.fixture.js';
import { buildWeeklyText } from './fixtures/weekly.fixture.js';

type MockRoute = 'scenario' | 'report' | 'entity' | 'weekly' | 'default';

const ROUTE_MATCHERS: Array<{ route: Exclude<MockRoute, 'default'>; patterns: RegExp[] }> = [
  {
    route: 'scenario',
    patterns: [
      /vector_patch/i,
      /stress_score/i,
      /boundary_strength/i,
      /Generate one micro-sandbox scenario/i,
      /Generate exactly 1 new high-pressure micro-sandbox scenario/i,
      /Output strict JSON array/i,
      /psychological scenario designer/i,
    ],
  },
  {
    route: 'report',
    patterns: [
      /ReportSchema/i,
      /evidence-v1/i,
      /evidenceHighlights/i,
      /trustBoundaries/i,
      /coreTraits/i,
    ],
  },
  {
    route: 'entity',
    patterns: [
      /entity extraction assistant/i,
      /value_conflicts/i,
      /persons/i,
      /严格输出 JSON/i,
      /信息提取助手/i,
    ],
  },
  {
    route: 'weekly',
    patterns: [
      /weekly review/i,
      /本周主导情绪/i,
      /情绪趋势/i,
      /生成本周回顾/i,
    ],
  },
];

export function detectMockRoute(system: string, user: string): MockRoute {
  const prompt = `${system}\n${user}`;
  for (const matcher of ROUTE_MATCHERS) {
    if (matcher.patterns.some((pattern) => pattern.test(prompt))) {
      return matcher.route;
    }
  }
  return 'default';
}

export function buildMockContent(system: string, user: string): string {
  const route = detectMockRoute(system, user);
  switch (route) {
    case 'scenario':
      return JSON.stringify(buildScenarioJson());
    case 'report':
      return JSON.stringify(buildReportJson());
    case 'entity':
      return JSON.stringify(buildEntityJson());
    case 'weekly':
      return buildWeeklyText();
    default:
      return '收到。你的输入已经记录，我会继续跟进。';
  }
}
