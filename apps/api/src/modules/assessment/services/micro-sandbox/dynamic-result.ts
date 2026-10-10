/** Post-play observations use selected text, never generated dimension scores as personality facts. */
export interface DynamicObservation {
  id: string;
  title: string;
  text: string;
  question: string;
  evidence: { scene_id: string; choice_id: string; situation: string; choice_text: string };
}

export function buildDynamicResult(
  scenes: Array<{ scene_id: string; scene_number: number; narrative: string; choices: Array<{ choice_id: string; text: string }> }>,
  path: Array<{ scene_id: string; choice_id: string }>,
): { psychological_narrative: string; observations: DynamicObservation[] } {
  const observations = path.map((step, index) => {
    const scene = scenes.find((item) => item.scene_id === step.scene_id);
    const choice = scene?.choices.find((item) => item.choice_id === step.choice_id);
    if (!scene || !choice) throw new Error('Completed playback contains an unknown scene or choice');
    return {
      id: `${scene.scene_id}:${choice.choice_id}`,
      title: `第 ${scene.scene_number} 段里，你这样回应`,
      text: `面对这一段情境，你选择了：“${choice.text}”`,
      question: index === 0
        ? '这像你现实中的反应吗？当时你最在意什么？'
        : '到这里，你的感受或在意的事情有变化吗？也可以说没有变化。',
      evidence: { scene_id: scene.scene_id, choice_id: choice.choice_id, situation: scene.narrative, choice_text: choice.text },
    };
  });
  return {
    psychological_narrative: observations.length
      ? `这次，你在 ${observations.length} 段情境中留下了自己的回应。下面可以回看你怎样面对这些事情，以及哪些反应像现实中的你。`
      : '',
    observations,
  };
}
