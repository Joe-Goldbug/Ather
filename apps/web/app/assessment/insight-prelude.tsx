import React from 'react';
import { getScenarioCopy } from '@eva/core/assessment';
import type { PersonalityVector, ScriptEvidence } from '@eva/core/shared';

export interface BehaviorInsight {
  title: string;
  interpretation: string;
  evidence: string;
}

export interface InsightPreludeOutput {
  title: string;
  summary: string;
  insights: BehaviorInsight[];
  strength: string;
  watchout: string;
  boundary: string;
}

const INSIGHT_TITLES: Record<string, string> = {
  trustBoundaries: '你如何让别人靠近',
  conflictResponse: '冲突里的你',
  attachment: '关系变得不确定时',
  emotionRegulation: '你如何消化难受',
  stressResponse: '压力下的你',
  achievementMotivation: '你对自己的要求',
  selfCognition: '被否定时，你如何看自己',
  socialEnergy: '你如何分配自己的能量',
};

function hasChoice(evidence: ScriptEvidence[], scenarioId: string, choices: string[]) {
  return evidence.some((item) => item.scenarioId === scenarioId && choices.includes(item.choice));
}

function buildHeadline(evidence: ScriptEvidence[], vector: PersonalityVector) {
  const willingToConnect = hasChoice(evidence, 'trust', ['A', 'B']);
  const selfBlaming = hasChoice(evidence, 'attachment', ['C'])
    || hasChoice(evidence, 'emotion', ['D'])
    || hasChoice(evidence, 'selfview', ['C']);
  const protectsBoundaries = hasChoice(evidence, 'trust', ['B', 'D'])
    || hasChoice(evidence, 'social_lowenergy', ['A', 'C'])
    || hasChoice(evidence, 'motive_social', ['C', 'D']);
  const highStandards = hasChoice(evidence, 'achievement', ['A'])
    || vector.perfectionism_score >= 0.8;
  const controlledConflict = hasChoice(evidence, 'conflict', ['B', 'C'])
    || hasChoice(evidence, 'conflict_friend', ['A', 'B'])
    || hasChoice(evidence, 'motive_silence', ['A', 'D']);

  if (willingToConnect && selfBlaming) {
    return '你愿意靠近，也容易把关系里的波动先算到自己头上';
  }
  if (highStandards && selfBlaming) {
    return '你对自己要求很高，也容易把一次失误变成对自己的否定';
  }
  if (protectsBoundaries && willingToConnect) {
    return '你愿意关心别人，但也在学习不让关系透支自己';
  }
  if (controlledConflict) {
    return '你不是害怕冲突，而是更想把冲突处理得有分寸';
  }
  if (highStandards) {
    return '你在意把事情做好，常常也因此比别人更难放过自己';
  }
  return '你有自己的保护方式，也有一套认真对待关系和事情的方法';
}

function buildSummary(evidence: ScriptEvidence[]) {
  const willingToConnect = hasChoice(evidence, 'trust', ['A', 'B']);
  const controlledConflict = hasChoice(evidence, 'conflict', ['B', 'C']);
  const selfBlaming = hasChoice(evidence, 'attachment', ['C']);

  if (willingToConnect && controlledConflict && selfBlaming) {
    return '你在关系里偏向主动靠近：别人发出脆弱信号时，你愿意认真接住；遇到公开否定，你更愿意先听清楚再回应。真正让你辛苦的，是关系一旦变冷，你会很快检查是不是自己做错了，并急着把连接修好。';
  }

  const interpretations = evidence
    .slice(0, 3)
    .map((item) => getScenarioCopy('zh-CN', item.scenarioId)?.options[item.choice]?.feedback)
    .filter((item): item is string => Boolean(item));

  return interpretations.length > 0
    ? interpretations.join(' ')
    : '你刚才的选择已经留下了一些行为线索，但还缺少能说清楚的具体情境。';
}

function buildStrength(evidence: ScriptEvidence[]) {
  if (hasChoice(evidence, 'trust', ['A']) && hasChoice(evidence, 'conflict', ['B', 'C'])) {
    return '你愿意接住别人的感受，也能在冲突中先理解再回应。这会让你显得可靠、好沟通，并且有能力把一段紧张的关系重新拉回对话。';
  }
  if (hasChoice(evidence, 'achievement', ['A', 'B']) || hasChoice(evidence, 'stress', ['A'])) {
    return '你有责任感，也愿意在复杂局面里主动整理问题。别人容易感受到你对事情的认真，以及把混乱重新拉回秩序的能力。';
  }
  if (hasChoice(evidence, 'trust', ['B', 'D']) || hasChoice(evidence, 'social_lowenergy', ['A', 'C'])) {
    return '你能注意到自己的容量，不会把“关心别人”简单等同于“必须牺牲自己”。这种边界感会让关系更可持续。';
  }
  return '你不是随意作答，而是在不同场景里表现出一套可辨认的应对方式。知道自己会怎么反应，本身就是调整和选择的起点。';
}

function buildWatchout(evidence: ScriptEvidence[]) {
  if (hasChoice(evidence, 'attachment', ['C'])) {
    return '你可能会比对方更早开始自责，把关系变冷理解成“是不是我不够好”。这会让你承担本来应该由双方一起说明和修复的责任。';
  }
  if (hasChoice(evidence, 'conflict', ['D']) || hasChoice(evidence, 'conflict_friend', ['C', 'D'])) {
    return '你可能把不舒服先收回去，表面保住了关系，自己的立场却没有真正被看见。积累久了，距离感会代替一次说清楚的机会。';
  }
  if (hasChoice(evidence, 'achievement', ['A']) || hasChoice(evidence, 'stress', ['B'])) {
    return '你容易靠继续投入来恢复控制感，但“再撑一下”也可能让你忽略已经超出容量。认真如果没有边界，会慢慢变成透支。';
  }
  if (hasChoice(evidence, 'socialenergy', ['D']) || hasChoice(evidence, 'motive_social', ['B'])) {
    return '你可能为了不让别人失望而参加并不想参加的关系活动。别人看见的是配合，你自己承担的却是更长的恢复成本。';
  }
  return '同一种保护方式在适合的情境里是优势，在压力过高时也可能限制你。值得留意的不是“改掉性格”，而是什么时候需要换一种回应。';
}

/**
 * Builds a specific behavioral portrait from this assessment's own choices.
 * It describes a current tendency without assigning a permanent identity type.
 */
export function buildInsightPrelude(
  vector: PersonalityVector,
  evidenceLog: ScriptEvidence[],
): InsightPreludeOutput | null {
  if (!vector) return null;

  const evidence = evidenceLog.filter((item) => item.scenarioTitle && item.choiceText).slice(0, 3);
  if (evidence.length === 0) {
    return {
      title: '这轮还没有形成可解释的画像',
      summary: '目前没有足够的具体选择可以解释。完成更多情境后，EVA 才能告诉你这些反应可能意味着什么。',
      insights: [],
      strength: '',
      watchout: '',
      boundary: '这里只描述本轮测评中出现的行为，不会凭空补出结论。',
    };
  }

  const insights = evidence.map((item) => {
    const option = getScenarioCopy('zh-CN', item.scenarioId)?.options[item.choice];
    return {
      title: INSIGHT_TITLES[item.dimensionId] ?? item.scenarioTitle,
      interpretation: option?.feedback ?? `在「${item.scenarioTitle}」中，你更倾向于${item.choiceLabel || item.choiceText}。`,
      evidence: `你的选择：${item.choiceText}`,
    };
  });

  return {
    title: buildHeadline(evidence, vector),
    summary: buildSummary(evidence),
    insights,
    strength: buildStrength(evidence),
    watchout: buildWatchout(evidence),
    boundary: '这是你在这轮情境中表现出的倾向，不是对你的永久定义。',
  };
}

export function InsightPrelude({
  vector,
  evidenceLog,
}: {
  vector: PersonalityVector;
  evidenceLog: ScriptEvidence[];
}) {
  const prelude = buildInsightPrelude(vector, evidenceLog);
  if (!prelude) return null;

  return (
    <section className="prelude-section" aria-labelledby="assessment-observation-heading">
      <h2 id="assessment-observation-heading" className="prelude-title">
        {prelude.title}
      </h2>
      <p className="prelude-paragraph">{prelude.summary}</p>

      {prelude.insights.length > 0 && (
        <div className="result-dim-grid">
          {prelude.insights.map((insight) => (
            <article key={`${insight.title}:${insight.evidence}`} className="result-dim-card">
              <h3>{insight.title}</h3>
              <p className="report-detail result-dim-body">{insight.interpretation}</p>
              <p className="report-detail result-dim-body">{insight.evidence}</p>
            </article>
          ))}
        </div>
      )}

      {prelude.strength && (
        <div className="report-insight">
          <h3 className="insight-label">你带来的优势</h3>
          <p className="insight-text">{prelude.strength}</p>
        </div>
      )}

      {prelude.watchout && (
        <div className="report-insight">
          <h3 className="insight-label">你可能付出的代价</h3>
          <p className="insight-text">{prelude.watchout}</p>
        </div>
      )}

      <p className="report-detail">{prelude.boundary}</p>
    </section>
  );
}
