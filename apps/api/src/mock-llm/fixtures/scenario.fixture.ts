export function buildScenarioJson() {
  return [
    {
      id: 'mock-micro-1',
      title: 'Mock Micro Scenario',
      setup: '你刚结束一段高压任务，朋友突然来问你要不要继续帮忙处理一个额外问题。',
      prompt: '你第一反应更接近下面哪一种？',
      options: {
        A: {
          label: '先答应',
          text: '我会先答应下来，之后再想怎么消化压力。',
          feedback: '你更容易先接住外部要求，再处理自己的负荷。',
        },
        B: {
          label: '先停一下',
          text: '我会先评估自己现在的状态，再决定要不要接。',
          feedback: '你会先做状态评估，再决定边界。',
        },
        C: {
          label: '直接拒绝',
          text: '我会直接拒绝，避免自己继续透支。',
          feedback: '你会优先保护自己的能量边界。',
        },
        D: {
          label: '模糊拖延',
          text: '我会先模糊回应，拖一会儿再看情况。',
          feedback: '你倾向先延迟正面处理决定。',
        },
      },
      vector_patch: {
        A: { stress_score: 0.8, boundary_strength: 0.3 },
        B: { stress_score: 0.45, boundary_strength: 0.65 },
        C: { stress_score: 0.3, boundary_strength: 0.85 },
        D: { stress_score: 0.7, boundary_strength: 0.4 },
      },
    },
  ];
}
