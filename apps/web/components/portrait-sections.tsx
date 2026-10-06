'use client';

import { useRef, useState } from 'react';
import {
  fetchEvidenceSource,
  withdrawEvidence,
  observationsV1Api,
  type EvidenceSourceResponse,
  type ObservationResponseAction,
  type PortraitV1Response,
  type ProfilePortraitResponse,
  type PublishedObservationV1,
} from '@/lib/api';
import { useLocale } from '@/app/providers-impl';
import type { ScriptResult } from '@eva/core/shared';
import { buildAssessmentEvidencePreview } from '@/app/assessment/assessment-evidence-preview';

const DIMENSION_I18N_KEYS: Record<string, string> = {
  trustBoundaries: 'profile.dim_trustBoundaries_short',
  conflictResponse: 'profile.dim_conflictResponse_short',
  attachment: 'profile.dim_attachment_short',
  emotionRegulation: 'profile.dim_emotionRegulation_short',
  stressResponse: 'profile.dim_stressResponse_short',
  achievementMotivation: 'profile.dim_achievementMotivation_short',
  selfCognition: 'profile.dim_selfCognition_short',
  socialEnergy: 'profile.dim_socialEnergy_short',
};

const UBV_SUMMARY_DIMENSIONS = [
  { source: 'attachment', labelKey: 'report.ubv_relationship_safety' },
  { source: 'trustBoundaries', labelKey: 'report.ubv_boundary_sense' },
  { source: 'emotionRegulation', labelKey: 'report.ubv_emotion_regulation' },
  { source: 'selfCognition', labelKey: 'report.ubv_self_clarity' },
] as const;

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function mapEmotionValue(value: ScriptResult['vector']['emotional_regulation']) {
  switch (value) {
    case 'internalizing':
      return 0.34;
    case 'externalizing':
      return 0.74;
    case 'rational':
      return 0.58;
    case 'deflecting':
      return 0.46;
    default:
      return 0.5;
  }
}

function mapAchievementValue(
  drive: ScriptResult['vector']['achievement_drive'],
  perfectionismScore: number,
) {
  switch (drive) {
    case 'high_standards':
      return clamp01((perfectionismScore + 0.78) / 2);
    case 'recognition_seeking':
      return clamp01((perfectionismScore + 0.65) / 2);
    case 'avoidance':
      return clamp01((perfectionismScore + 0.25) / 2);
    case 'flow_state':
      return clamp01((perfectionismScore + 0.56) / 2);
    default:
      return perfectionismScore;
  }
}

function buildResultRadar(result: ScriptResult) {
  const { vector } = result;
  const confidence = vector.confidence ?? {};

  return [
    {
      dimension: 'trustBoundaries',
      value: clamp01((vector.trust_threshold + vector.boundary_strength) / 2),
      confidence: confidence.trust ?? 0.6,
    },
    {
      dimension: 'conflictResponse',
      value: clamp01(vector.conflict_score),
      confidence: confidence.conflict ?? 0.6,
    },
    {
      dimension: 'attachment',
      value: clamp01(vector.attachment_score),
      confidence: confidence.attachment ?? 0.6,
    },
    {
      dimension: 'emotionRegulation',
      value: mapEmotionValue(vector.emotional_regulation),
      confidence: confidence.emotion ?? 0.6,
    },
    {
      dimension: 'stressResponse',
      value: clamp01(vector.stress_score),
      confidence: confidence.stress ?? 0.6,
    },
    {
      dimension: 'achievementMotivation',
      value: mapAchievementValue(vector.achievement_drive, vector.perfectionism_score),
      confidence: confidence.achievement ?? 0.6,
    },
    {
      dimension: 'selfCognition',
      value: clamp01(vector.growth_mindset_score),
      confidence: confidence.selfview ?? 0.6,
    },
    {
      dimension: 'socialEnergy',
      value: clamp01(vector.social_energy_score),
      confidence: confidence.socialenergy ?? 0.6,
    },
  ];
}

function describeDimensionResult(dimension: string, value: number): string {
  const high = value >= 0.5;
  return `report.dimension_result_${dimension}_${high ? 'high' : 'low'}`;
}

export function RadarChart({
  data,
  label,
  t,
}: {
  data: Array<{ dimension: string; value: number; confidence: number }>;
  label: string;
  t: (key: string) => string;
}) {
  const size = 300;
  const center = size / 2;
  const radius = 120;
  const levels = 4;
  const count = data.length;

  if (count === 0) return null;

  const angleFor = (idx: number) => (Math.PI * 2 * idx) / count - Math.PI / 2;
  const pointAt = (r: number, idx: number) => {
    const a = angleFor(idx);
    return { x: center + r * Math.cos(a), y: center + r * Math.sin(a) };
  };

  const valuePolygon = data
    .map((d, i) => {
      const p = pointAt(clamp01(d.value) * radius, i);
      return `${p.x},${p.y}`;
    })
    .join(' ');

  const confidencePolygon = data
    .map((d, i) => {
      const p = pointAt(clamp01(d.confidence) * radius, i);
      return `${p.x},${p.y}`;
    })
    .join(' ');

  return (
    <div className="radar-container">
      <svg
        className="radar-svg"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={label}
      >
        {Array.from({ length: levels }).map((_, lvl) => {
          const r = ((lvl + 1) / levels) * radius;
          const ring = Array.from({ length: count })
            .map((__, i) => {
              const p = pointAt(r, i);
              return `${p.x},${p.y}`;
            })
            .join(' ');
          const isFirst = lvl === 0;
          return (
            <polygon
              key={`ring-${lvl}`}
              points={ring}
              fill="none"
              stroke={isFirst ? '#f5f5f5' : '#f0f0f0'}
              strokeWidth={isFirst ? '1' : '0.5'}
              strokeDasharray={lvl === 1 ? '2,2' : undefined}
            />
          );
        })}

        {data.map((_, i) => {
          const p = pointAt(radius, i);
          return (
            <line
              key={`axis-${i}`}
              x1={center}
              y1={center}
              x2={p.x}
              y2={p.y}
              stroke="#f5f5f5"
              strokeWidth="0.5"
            />
          );
        })}

        <polygon
          points={confidencePolygon}
          fill="none"
          stroke="#d4d4d4"
          strokeDasharray="3 3"
          strokeWidth="1"
          strokeLinejoin="round"
        />

        <polygon
          points={valuePolygon}
          fill="none"
          stroke="#171717"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {data.map((d, i) => {
          const p = pointAt(clamp01(d.value) * radius, i);
          return (
            <circle
              key={`dot-${i}`}
              cx={p.x}
              cy={p.y}
              r="3"
              fill="#171717"
            />
          );
        })}

        {data.map((d, i) => {
          const p = pointAt(radius + 18, i);
          return (
            <text
              key={`label-${i}`}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--text-secondary, #737373)"
              fontSize="11"
            >
              {DIMENSION_I18N_KEYS[d.dimension] ? t(DIMENSION_I18N_KEYS[d.dimension]) : d.dimension}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export function UBVSummaryPanel({
  radar,
  title,
  subtitle,
  t,
}: {
  radar: Array<{ dimension: string; value: number; confidence: number }>;
  title: string;
  subtitle: string;
  t: (key: string) => string;
}) {
  const byDimension = new Map(radar.map((item) => [item.dimension, item]));
  const items = UBV_SUMMARY_DIMENSIONS
    .map(({ source, labelKey }) => {
      const match = byDimension.get(source);
      if (!match) return null;
      return {
        label: t(labelKey),
        value: Math.round(clamp01(match.value) * 100),
      };
    })
    .filter((item): item is { label: string; value: number } => item !== null);

  if (items.length === 0) return null;

  return (
    <section aria-label={title} className="section-card">
      <div className="section-header-minimal">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>

      <div className="ubv-summary-container">
        {items.map((item) => (
          <div key={item.label}>
            <div className="ubv-item-row">
              <span className="ubv-item-label">{item.label}</span>
              <span className="ubv-item-value">
                {item.value}%
              </span>
            </div>
            <div className="progress-bar-minimal">
              <div style={{ width: `${item.value}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────
// Confidence explanation redesign (V1, 2026-06-25 spec)
//
// Two-layer IA:
//   Layer 1 (default): summary card + per-dimension state/explanation/action
//   Layer 2 (on demand): "EVA 是怎么判断的？" disclosure with the
//                        four humanized factor names; the current
//                        limiting factor is gently marked.
//
// Backend contract unchanged. State derivation happens here from
// radar[].confidence and confidenceBreakdown[].triggerTargetedTest.
// ─────────────────────────────────────────────────────────────────

type ConfidenceState =
  | 'initial'
  | 'relatively_stable'
  | 'very_stable'
  | 'confirming';

type LimitingFactor = 'sufficiency' | 'consistency' | 'sourceCoverage' | 'calibration';

const STATE_THRESHOLDS = {
  initial: 0.45,
  relatively_stable: 0.7,
} as const;

const METHOD_ORDER: LimitingFactor[] = [
  'sufficiency',
  'sourceCoverage',
  'consistency',
  'calibration',
];

// Calm, non-alarming palette. Red is intentionally absent from the
// primary view. Amber is reserved for the contradiction-heavy state.
const STATE_PALETTE: Record<
  ConfidenceState,
  { bg: string; fg: string; border: string; dot: string }
> = {
  initial: {
    bg: 'rgba(100,116,139,0.10)',
    fg: '#475569',
    border: 'rgba(100,116,139,0.30)',
    dot: '#94a3b8',
  },
  relatively_stable: {
    bg: 'rgba(2,132,199,0.10)',
    fg: '#0369a1',
    border: 'rgba(2,132,199,0.35)',
    dot: '#0284c7',
  },
  very_stable: {
    bg: 'rgba(16,185,129,0.10)',
    fg: '#065f46',
    border: 'rgba(16,185,129,0.35)',
    dot: '#10b981',
  },
  confirming: {
    bg: 'rgba(245,158,11,0.12)',
    fg: '#92400e',
    border: 'rgba(245,158,11,0.40)',
    dot: '#f59e0b',
  },
};

function deriveConfidenceState(
  confidence: number,
  triggerTargetedTest: boolean,
): ConfidenceState {
  if (triggerTargetedTest) return 'confirming';
  if (confidence < STATE_THRESHOLDS.initial) return 'initial';
  if (confidence < STATE_THRESHOLDS.relatively_stable) return 'relatively_stable';
  return 'very_stable';
}

function deriveConfidenceFromFactors(factors: {
  sufficiency: number;
  consistency: number;
  sourceCoverage: number;
  calibration: number;
}): number {
  return Math.min(
    factors.sufficiency,
    factors.consistency,
    factors.sourceCoverage,
    factors.calibration,
  );
}

function stateLabelKey(state: ConfidenceState): string {
  switch (state) {
    case 'initial':
      return 'report.confidence_state_initial';
    case 'relatively_stable':
      return 'report.confidence_state_relatively_stable';
    case 'very_stable':
      return 'report.confidence_state_very_stable';
    case 'confirming':
      return 'report.confidence_state_confirming';
  }
}

function explainKeyForState(state: ConfidenceState): string {
  switch (state) {
    case 'initial':
      return 'report.confidence_explain_initial';
    case 'relatively_stable':
      return 'report.confidence_explain_relatively_stable';
    case 'very_stable':
      return 'report.confidence_explain_very_stable';
    case 'confirming':
      return 'report.confidence_explain_confirming';
  }
}

function actionKeyForLimiter(factor: LimitingFactor | undefined): string {
  switch (factor) {
    case 'sufficiency':
      return 'report.confidence_action_sufficiency';
    case 'sourceCoverage':
      return 'report.confidence_action_source_coverage';
    case 'consistency':
      return 'report.confidence_action_consistency';
    case 'calibration':
      return 'report.confidence_action_calibration';
    default:
      return 'report.confidence_action_default';
  }
}

function methodLabelKey(factor: LimitingFactor): string {
  switch (factor) {
    case 'sufficiency':
      return 'report.confidence_method_sufficiency';
    case 'sourceCoverage':
      return 'report.confidence_method_source_coverage';
    case 'consistency':
      return 'report.confidence_method_consistency';
    case 'calibration':
      return 'report.confidence_method_calibration';
  }
}

// ─────────────────────────────────────────────────────────────────
// V1.1 key resolvers (per 2026-06-26 spec)
//
// Key construction: pure string concat, no t() call.
// Resolver: applies the spec's 3-tier fallback chain:
//   1. dimension-specific key
//   2. V1 generic state/factor key
//   3. hardcoded safe fallback
//
// Chinese locale hits tier 1 on every card. Non-Chinese locales
// fall through to tier 2 (V1 generic) and finally to a hardcoded
// safe fallback so the UI never displays the raw i18n key path.
// ─────────────────────────────────────────────────────────────────

function readingKeyForDimensionState(
  dimension: string,
  state: ConfidenceState,
): string {
  const stateSuffix = state === 'relatively_stable' ? 'relativelyStable' : state;
  return `report.confidence_reading_${dimension}_${stateSuffix}`;
}

function boundaryKeyForDimensionLimiter(
  dimension: string,
  limiter: LimitingFactor,
): string {
  return `report.confidence_boundary_${dimension}_${limiter}`;
}

function actionKeyForDimensionLimiter(
  dimension: string,
  limiter: LimitingFactor,
): string {
  return `report.confidence_action_${dimension}_${limiter}`;
}

type TFunction = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

function resolveReading(
  dimension: string,
  state: ConfidenceState,
  t: TFunction,
): string {
  const primaryKey = readingKeyForDimensionState(dimension, state);
  const primary = t(primaryKey);
  if (primary !== primaryKey) return primary;
  const v1Key = `report.confidence_explain_${state}`;
  const v1Text = t(v1Key);
  if (v1Text !== v1Key) return v1Text;
  return 'EVA is still getting to know this part of you.';
}

function resolveBoundary(
  dimension: string,
  limiter: LimitingFactor,
  t: TFunction,
): string {
  const primaryKey = boundaryKeyForDimensionLimiter(dimension, limiter);
  const primary = t(primaryKey);
  if (primary !== primaryKey) return primary;
  return 'More real evidence is needed for this part of you.';
}

function resolveAction(
  dimension: string,
  limiter: LimitingFactor,
  t: TFunction,
): string {
  const primaryKey = actionKeyForDimensionLimiter(dimension, limiter);
  const primary = t(primaryKey);
  if (primary !== primaryKey) return primary;
  const v1Key = `report.confidence_action_${limiter}`;
  const v1Text = t(v1Key);
  if (v1Text !== v1Key) return v1Text;
  return t('report.confidence_action_default');
}

function ConfidenceSummaryCard({
  stableCount,
  confirmingCount,
  priorityDimensions,
  t,
}: {
  stableCount: number;
  confirmingCount: number;
  priorityDimensions: string[];
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const separator = t('report.list_separator');
  const priorityNames = priorityDimensions
    .map((d) => (DIMENSION_I18N_KEYS[d] ? t(DIMENSION_I18N_KEYS[d]) : d))
    .join(separator);

  return (
    <div
      className="confidence-summary-minimal"
      role="status"
      aria-label={t('report.confidence_breakdown_title')}
    >
      <div className="confidence-stats-minimal">
        <span>
          {t('report.confidence_summary_stable_count', { count: stableCount })}
        </span>
        <span>
          {t('report.confidence_summary_confirming_count', { count: confirmingCount })}
        </span>
      </div>
      <div className="confidence-summary-priority">
        {priorityDimensions.length > 0
          ? t('report.confidence_summary_priority', { dimensions: priorityNames })
          : t('report.confidence_summary_no_priority')}
      </div>
    </div>
  );
}

export function ConfidenceDimensionCard({
  dimension,
  state,
  limitingFactor,
  t,
}: {
  dimension: string;
  state: ConfidenceState;
  limitingFactor: LimitingFactor;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  // [fix 2026-06-25] 每张卡片独立持有自己展开状态,而不是父组件用一个共享 state
  // 控制所有卡片(共享 state 会导致开 B 自动关 A,违反"用户操作才开关"的契约)。
  const [expanded, setExpanded] = useState(false);
  const onToggleDisclosure = () => setExpanded((prev) => !prev);
  const palette = STATE_PALETTE[state];
  const dimensionName = DIMENSION_I18N_KEYS[dimension]
    ? t(DIMENSION_I18N_KEYS[dimension])
    : dimension;

  return (
    <div
      className="confidence-card-minimal"
    >
      <div className="conf-card-header">
        <span className="conf-card-name">{dimensionName}</span>
        <span aria-hidden="true" className="conf-card-dot">
          ·
        </span>
        <span
          className="conf-state-badge"
          style={{
            background: palette.bg,
            color: palette.fg,
            border: `1px solid ${palette.border}`,
          }}
          aria-label={t(stateLabelKey(state))}
        >
          {t(stateLabelKey(state))}
        </span>
      </div>

      <p className="conf-card-reading">
        {resolveReading(dimension, state, t)}
      </p>

      <p className="conf-card-boundary">
        {resolveBoundary(dimension, limitingFactor, t)}
      </p>

      <p className="conf-card-action">
        {resolveAction(dimension, limitingFactor, t)}
      </p>

      <button
        type="button"
        className="conf-disclosure-btn"
        onClick={onToggleDisclosure}
        aria-expanded={expanded}
        aria-controls={`confidence-method-${dimension}`}
      >
        <span>
          {expanded
            ? t('report.confidence_method_collapse')
            : t('report.confidence_method_trigger')}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={expanded ? "conf-disclosure-icon expanded" : "conf-disclosure-icon"}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <ul
          id={`confidence-method-${dimension}`}
          className="conf-method-list"
        >
          {METHOD_ORDER.map((key) => {
            const isCurrent = key === limitingFactor;
            return (
              <li
                key={key}
                className={`conf-method-item ${isCurrent ? 'current' : ''}`}
              >
                <span
                  aria-hidden="true"
                  className="conf-method-dot"
                  style={{ background: isCurrent ? palette.dot : 'var(--border-color)' }}
                />
                <span>{t(methodLabelKey(key))}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ConfidenceBreakdown({
  breakdown,
  radar,
  t,
}: {
  breakdown: Array<{
    dimension: string;
    factors: {
      sufficiency: number;
      consistency: number;
      sourceCoverage: number;
      calibration: number;
    };
    limitingFactor: LimitingFactor;
    triggerTargetedTest: boolean;
  }>;
  radar: Array<{ dimension: string; value: number; confidence: number }>;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  // [fix 2026-06-25] 不再持有 expandedDim 共享 state。每张卡自己持有 useState,
  // 开一张卡不会自动关另一张。

  if (breakdown.length === 0) return null;

  // Build confidence lookup from radar; fall back to min(factors) if
  // radar doesn't carry this dimension. Both sources are derived from
  // the same engine, but we keep a fallback for robustness.
  const confidenceByDim = new Map<string, number>();
  radar.forEach((r) => confidenceByDim.set(r.dimension, r.confidence));

  const items = breakdown.map((item) => {
    const radarConfidence = confidenceByDim.get(item.dimension);
    const confidence =
      typeof radarConfidence === 'number'
        ? radarConfidence
        : deriveConfidenceFromFactors(item.factors);
    return {
      dimension: item.dimension,
      state: deriveConfidenceState(confidence, item.triggerTargetedTest),
      limitingFactor: item.limitingFactor,
      confidence,
    };
  });

  const stableCount = items.filter(
    (it) => it.state === 'relatively_stable' || it.state === 'very_stable',
  ).length;
  const confirmingCount = items.filter((it) => it.state === 'confirming').length;

  // Priority: up to 2 dimensions that are still initial/confirming,
  // ordered by lowest confidence first.
  const priorityDimensions = items
    .filter((it) => it.state === 'initial' || it.state === 'confirming')
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, 2)
    .map((it) => it.dimension);

  return (
    <div>
      <h3 className="portrait-section-title">
        {t('report.confidence_breakdown_title')}
      </h3>
      <p className="portrait-section-desc">
        {t('report.confidence_intro')}
      </p>

      <ConfidenceSummaryCard
        stableCount={stableCount}
        confirmingCount={confirmingCount}
        priorityDimensions={priorityDimensions}
        t={t}
      />

      <div className="confidence-layout">
        {items.map((it) => (
          <ConfidenceDimensionCard
            key={it.dimension}
            dimension={it.dimension}
            state={it.state}
            limitingFactor={it.limitingFactor}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

function UnlockProgress({
  progress,
  t,
}: {
  progress: { unlocked: boolean; gaps: string[] };
  t: (key: string) => string;
}) {
  const totalConditions = 5;
  const metConditions = totalConditions - progress.gaps.length;

  return (
    <div className="portrait-unlock-wrap">
      <h3 className="portrait-section-title">
        {t('report.unlock_progress_title')}
      </h3>

      {progress.unlocked ? (
        <div
          className="confidence-card-minimal status-card-success"
          role="status"
        >
          ✓ {t('report.stage2_unlocked')}
        </div>
      ) : (
        <>
          <div className="progress-container-minimal">
            <div className="progress-label-minimal">
              <span className="label-text">{t('report.progress_label')}</span>
              <span className="label-value">
                {metConditions}/{totalConditions}
              </span>
            </div>
            <div
              className="progress-bar"
              role="progressbar"
              aria-valuenow={metConditions}
              aria-valuemin={0}
              aria-valuemax={totalConditions}
            >
              <div
                className="progress-bar-fill"
                style={{ width: `${(metConditions / totalConditions) * 100}%` }}
              />
            </div>
          </div>

          {progress.gaps.length > 0 && (
            <ul className="gap-list-minimal">
              {progress.gaps.map((gap, i) => (
                <li
                  key={i}
                  className="confidence-card-minimal gap-item-minimal"
                >
                  <span className="gap-item-icon" aria-hidden="true">○</span>
                  {gap}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export function ProfilePortraitView({
  data,
  loading,
  error,
}: {
  data: ProfilePortraitResponse | PortraitV1Response | null;
  loading: boolean;
  error: string;
}) {
  const { t } = useLocale();

  // 2-A3：证据原文回溯弹层状态（hooks 必须在条件返回之前调用）
  const [evidenceDialog, setEvidenceDialog] = useState<
    { status: 'loading' | 'ready' | 'error'; data?: EvidenceSourceResponse; error?: string; quote: string | null } | null
  >(null);
  // 1-2b：弹层内直接驳回该证据（withdraw → 画像重算）
  const [withdrawState, setWithdrawState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  function openEvidenceSource(evidenceId: string, quote: string | null) {
    setEvidenceDialog({ status: 'loading', quote });
    setWithdrawState('idle');
    fetchEvidenceSource(evidenceId)
      .then((data) => setEvidenceDialog({ status: 'ready', data, quote }))
      .catch((err: unknown) =>
        setEvidenceDialog({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
          quote,
        }),
      );
  }

  async function handleWithdrawEvidence() {
    const evidenceId = evidenceDialog?.data?.evidence_id;
    if (!evidenceId) return;
    setWithdrawState('loading');
    try {
      await withdrawEvidence(evidenceId);
      setWithdrawState('done');
    } catch {
      setWithdrawState('error');
    }
  }

  if (loading) {
    return (
      <div className="portrait-loading-state">
        {t('common.loading')}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="portrait-error-state">
        <p>{error || t('report.no_map_data')}</p>
      </div>
    );
  }

  const observations = 'observations' in data ? data.observations : [];

  return (
    <div className="portrait-view-stack">
      <section aria-labelledby="portrait-observations-heading" className="portrait-radar-section">
        <h3 id="portrait-observations-heading">目前收集到的线索</h3>
        <p>这里只展示能回看的记录，不把它们换算成人格分数或固定结论。</p>

        {observations.length === 0 ? (
          <p className="empty-state-text">目前还没有可展示的正式线索，无法判断长期模式。</p>
        ) : (
          <ul className="result-dim-grid">
            {observations.map((observation) => (
              <li key={observation.id} className="result-dim-card">
                <strong>{t(DIMENSION_I18N_KEYS[observation.dimension] ?? observation.dimension)}</strong>
                <span className="report-detail result-dim-body">
                  已记录 {observation.evidence.length} 条可回看线索
                </span>
                <ul className="evidence-nodes">
                  {observation.evidence.map((evidence) => (
                    <li key={evidence.id} className="evidence-node">
                      <button
                        type="button"
                        className="evidence-node-link"
                        onClick={() => openEvidenceSource(evidence.id, evidence.quote)}
                      >
                        {evidence.quote || evidence.explanation}
                      </button>
                    </li>
                  ))}
                </ul>
                <span className="report-detail result-dim-body">{observation.limitation}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {evidenceDialog && (
        <div className="evidence-source-overlay" onClick={() => setEvidenceDialog(null)}>
          <div
            role="dialog"
            aria-label="证据原文"
            className="evidence-source-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="evidence-source-toolbar">
              <span className="report-detail">证据原文</span>
              {evidenceDialog.status === 'ready' && evidenceDialog.data && (
                <button
                  type="button"
                  className="evidence-withdraw-button"
                  disabled={withdrawState === 'loading' || withdrawState === 'done'}
                  onClick={handleWithdrawEvidence}
                >
                  驳回此证据
                </button>
              )}
              <button type="button" onClick={() => setEvidenceDialog(null)}>
                关闭
              </button>
            </div>
            {withdrawState === 'done' && (
              <p className="empty-state-text">已驳回，画像置信度已重算。</p>
            )}
            {withdrawState === 'error' && (
              <p className="empty-state-text">驳回失败，请稍后重试。</p>
            )}
            {evidenceDialog.status === 'loading' && <p>{t('common.loading')}</p>}
            {evidenceDialog.status === 'error' && (
              <p className="empty-state-text">{evidenceDialog.error}</p>
            )}
            {evidenceDialog.status === 'ready' && evidenceDialog.data && (
              evidenceDialog.data.content_text && evidenceDialog.data.fragment ? (
                <HighlightedFragment
                  text={evidenceDialog.data.content_text}
                  start={evidenceDialog.data.fragment.start}
                  end={evidenceDialog.data.fragment.end}
                />
              ) : (
                <p className="empty-state-text">
                  无法定位原始片段（原文可能已被编辑）。证据引用：{evidenceDialog.quote ?? '（无引用）'}
                </p>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 按 [start, end) 区间渲染原文并高亮触发句；偏移越界时防御性收敛 */
function HighlightedFragment({ text, start, end }: { text: string; start: number; end: number }) {
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));
  return (
    <p className="evidence-source-text">
      {text.slice(0, safeStart)}
      <mark>{text.slice(safeStart, safeEnd)}</mark>
      {text.slice(safeEnd)}
    </p>
  );
}

function newOperationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Older browsers still need a UUID because the API validates idempotency keys.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * The only correction UI for the continuous-portrait contract. Each response
 * names both the published observation and the exact revision the user saw.
 */
export function PublishedObservationResponseSection({
  observations,
}: {
  observations: PublishedObservationV1[];
}) {
  const [selected, setSelected] = useState<PublishedObservationV1 | null>(null);
  const [action, setAction] = useState<ObservationResponseAction | null>(null);
  const [explanation, setExplanation] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [localFeedback, setLocalFeedback] = useState<Record<string, PublishedObservationV1['feedback_state']>>({});
  const pendingOperations = useRef(new Map<string, string>());

  async function submit(nextAction: ObservationResponseAction) {
    if (!selected) return;
    const trimmedExplanation = explanation.trim();
    const requestKey = JSON.stringify([selected.observation_id, selected.revision_id, nextAction, trimmedExplanation]);
    let operationId = pendingOperations.current.get(requestKey);
    if (!operationId) {
      operationId = newOperationId();
      pendingOperations.current.set(requestKey, operationId);
    }
    setStatus('submitting');
    try {
      await observationsV1Api.respond(selected.observation_id, selected.revision_id, {
        operation_id: operationId,
        action: nextAction,
        explanation: trimmedExplanation || undefined,
      });
      pendingOperations.current.delete(requestKey);
      setLocalFeedback((previous) => ({
        ...previous,
        [selected.revision_id]: nextAction === 'confirm' ? 'uncontested' : 'needs_follow_up',
      }));
      setStatus('done');
      setAction(null);
      setExplanation('');
    } catch {
      setStatus('error');
    }
  }

  if (observations.length === 0) {
    return (
      <section aria-label="回应正式观察">
        <div className="section-title">回应正式观察</div>
        <p className="correction-section-desc">
          目前没有已发布的正式观察，因此没有可以纠正的结论。你完成的选择会先作为记录保留，不会直接变成人格判断。
        </p>
      </section>
    );
  }

  return (
    <section aria-label="回应正式观察">
      <div className="section-title">回应正式观察</div>
      <p className="correction-section-desc">
        只回应你现在看到的这条具体观察。反馈会立即改变这条观察的展示状态；长期画像仍需另外核验。
      </p>
      <ul className="evidence-nodes">
        {observations.map((observation) => (
          <li key={observation.revision_id} className="evidence-node">
            {(localFeedback[observation.revision_id] ?? observation.feedback_state) === 'needs_follow_up' && (
              <strong>你已回应这条观察。以下是当时的原文，仍待核对，不是当前无争议结论。</strong>
            )}
            <p>{observation.text || '该观察未提供可显示文本。'}</p>
            <button
              type="button"
              className="btn-save-minimal"
              onClick={() => {
                setSelected(observation);
                setAction(null);
                setExplanation('');
                setStatus('idle');
              }}
            >
              回应这条观察
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <div className="correction-panel">
          <p className="correction-prompt">你正在回应：{selected.text || '这条正式观察'}</p>
          <div className="correction-buttons">
            <button type="button" className="btn-note" disabled={status === 'submitting'} onClick={() => void submit('confirm')}>符合</button>
            <button type="button" className="btn-partial" disabled={status === 'submitting'} onClick={() => setAction('partial')}>部分符合</button>
            <button type="button" className="btn-incorrect" disabled={status === 'submitting'} onClick={() => setAction('refute')}>不符合</button>
            <button type="button" className="btn-note" disabled={status === 'submitting'} onClick={() => setAction('clarify')}>补充情境</button>
          </div>
          {action && (
            <div className="correction-input">
              <textarea
                value={explanation}
                onChange={(event) => setExplanation(event.target.value)}
                placeholder="请说明是什么情境、哪里不符合，或缺少了什么。"
                rows={3}
              />
              <div className="correction-actions">
                <button type="button" className="btn-cancel" onClick={() => setAction(null)}>取消</button>
                <button type="button" className="btn-primary" disabled={status === 'submitting'} onClick={() => void submit(action)}>
                  {status === 'submitting' ? '提交中…' : '提交回应'}
                </button>
              </div>
            </div>
          )}
          {status === 'done' && <p className="correction-done">已保存。展示状态已更新；正式画像尚未重算。</p>}
          {status === 'error' && <p className="error">保存结果未确认。本页相同内容可安全重试；修改内容会作为新反馈提交。</p>}
        </div>
      )}
    </section>
  );
}

export function ResultPortraitPreview({ result }: { result: ScriptResult | null }) {
  if (!result) return null;

  const preview = buildAssessmentEvidencePreview(result.evidence_log);

  return (
    <section className="result-supplement-section" aria-label={preview.title}>
      <h2 className="insight-label result-preview-title">{preview.title}</h2>
      {preview.facts.length > 0 && (
        <ul className="result-dim-grid">
          {preview.facts.map((fact) => (
            <li key={`${fact.scenario}-${fact.choice}`} className="result-dim-card">
              <strong>{fact.scenario}</strong>
              <span className="report-detail result-dim-body">你的选择：{fact.choice}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
