// apps/api/src/modules/assessment/services/micro-sandbox/script-generator.service.ts
//
// Script Generator — picks the right scenario template for a user's
// ExtractedVariables, then asks MiniMax-M3 to fill each scene's
// narrative_template with the user's real variables (key_person_name,
// trigger_event, etc.). Falls back to a deterministic manual fill if M3
// is unreachable so the user always gets a playable script.
//
// Responsibilities:
//   - selectTemplate: pick work / family / relationship template by scenario_type
//   - generateScript: M3 JSON call → assemble scenes → fallback on error
//   - buildVariableMap: flatten ExtractedVariables into the placeholder keys
//     that the templates' narrative_templates expect
//
// All M3 calls go through the shared DynamicScriptFunnelConfig so we
// reuse funnel()'s retry/timeout/postprocessing — no parallel client.

import { Injectable, Logger } from '@nestjs/common';
import type { ExtractedVariables } from '../../dto/dynamic-script/shared/extracted-variables.dto.js';
import type {
  GeneratedScript,
  GeneratedScene,
} from '../../dto/dynamic-script/shared/generated-script.dto.js';
import {
  DynamicScriptFunnelConfig,
  callM3Json,
} from '../../../../common/minimax/dynamic-script-funnel.config.js';
import {
  workConflictTemplate,
  type ScriptTemplate,
} from './scenario-templates/work-conflict.template.js';
import { familyConflictTemplate } from './scenario-templates/family-conflict.template.js';
import { relationshipTemplate } from './scenario-templates/relationship.template.js';

/**
 * Issue shape accepted by generateScript() during revision.
 *
 * Matches the shapes returned by the validation orchestrator's
 * `aggregated_issues_for_revision` and the per-agent result's `issues[]`.
 *
 * Only `description` is required; `location`, `suggestion`,
 * `agent_name`, and `severity` are surfaced to M3 when present so the
 * model can target revisions to the specific scene + choice the
 * validator flagged.
 */
export interface RevisionIssue {
  description: string;
  location?: string;
  suggestion?: string;
  agent_name?: string;
  severity?: string;
}

/** Map scenario_type → ScriptTemplate. Falls back to work on unknown/other. */
const TEMPLATES: Record<ExtractedVariables['scenario_type'], ScriptTemplate> = {
  work: workConflictTemplate,
  family: familyConflictTemplate,
  romantic: relationshipTemplate,
  social: relationshipTemplate,
  other: workConflictTemplate,
};

interface M3GenerationPayload {
  template_id: string;
  filled_narratives: Record<string, string>;
  dimension_coverage: string[];
  variable_usage: Record<string, boolean>;
}

const GENERATION_PROMPT = `你是 EVA 的"剧本生成器"。基于用户的真实变量，调用对应的剧本模板并填充变量。

返回严格的 JSON（不要 markdown 包裹）：
{
  "template_id": "模板 ID",
  "filled_narratives": { "scene-1": "已填充的剧本", "scene-2": "...", ... },
  "dimension_coverage": ["覆盖到的 15 维度列表"],
  "variable_usage": { "key_person_name": true, "trigger_event": true, ... }
}

要求：
- 每个 scene_id 都必须在 filled_narratives 中出现
- 必须把 {{key_person_name}} / {{trigger_event}} / {{relationship_with_person}}
  / {{relationship_type}} / {{emotion_state}} / {{coping_strategy}}
  / {{family_dynamic}} / {{relationship_history}} 这些变量替换为用户的真实信息
- 保持中文口语化风格，不要学术腔`;

@Injectable()
export class ScriptGeneratorService {
  private readonly logger = new Logger(ScriptGeneratorService.name);

  constructor(private readonly funnelConfig: DynamicScriptFunnelConfig) {}

  /**
   * Pick a template purely from the scenario_type field. The map above
   * covers all 5 enum values; an unknown type falls back to work.
   */
  selectTemplate(variables: ExtractedVariables): ScriptTemplate {
    return TEMPLATES[variables.scenario_type] ?? workConflictTemplate;
  }

  /**
   * Generate a playable script by asking M3 to fill the chosen template's
   * scenes with the user's variables. If M3 is unreachable / malformed,
   * we degrade gracefully to manualFill so the user never sees a 500.
   *
   * Pass `revisionIssues` (non-empty array) when regenerating after a
   * validation failure: the issues are appended to the SYSTEM PROMPT
   * (not just the user prompt) so M3 sees them as a hard constraint
   * and targets its revision at exactly the choices + scenes the
   * validators flagged. Without this, revise() would just re-generate
   * the same broken script.
   */
  async generateScript(
    variables: ExtractedVariables,
    locale: string,
    revisionIssues?: RevisionIssue[],
  ): Promise<GeneratedScript> {
    const template = this.selectTemplate(variables);
    const variableMap = this.buildVariableMap(variables);

    const systemPrompt = revisionIssues && revisionIssues.length > 0
      ? `${GENERATION_PROMPT}\n\n${this.buildRevisionConstraints(revisionIssues)}`
      : GENERATION_PROMPT;

    try {
      const payload = await callM3Json<M3GenerationPayload>(
        this.funnelConfig,
        systemPrompt,
        `变量：\n${JSON.stringify(variableMap)}\n\n可用模板：\n${template.template_id}（共 ${template.scenes.length} 个场景）\n\n剧本模板 JSON：\n${JSON.stringify(template)}\n\n请输出 JSON。`,
      );

      return this.assembleScript(template, payload, variableMap);
    } catch (err) {
      this.logger.warn(
        `M3 script generation failed, using manual fallback: ${String(err)}`,
      );
      return this.fallbackManualFill(template, variableMap);
    }
  }

  /**
   * Format aggregated validation issues as a SYSTEM-PROMPT constraint
   * block appended after GENERATION_PROMPT. Each issue is rendered on
   * its own line with the agent that raised it, the affected location,
   * and the suggested fix. The prompt tells M3 to ENSURE the final
   * script does NOT repeat any of these issues.
   */
  private buildRevisionConstraints(issues: RevisionIssue[]): string {
    const lines = issues.map((issue, idx) => {
      const parts: string[] = [`${idx + 1}.`];
      if (issue.agent_name) parts.push(`[${issue.agent_name}${issue.severity ? `/${issue.severity}` : ''}]`);
      if (issue.description) parts.push(issue.description);
      if (issue.location) parts.push(`(location: ${issue.location})`);
      if (issue.suggestion) parts.push(`→ 建议: ${issue.suggestion}`);
      return parts.join(' ');
    });

    return [
      '—— 上一轮剧本被以下问题打回，请在本轮生成中确保已经全部解决 ——',
      ...lines,
      '—— 必须在新的 filled_narratives + choices 中体现修复，否则会再次被打回 ——',
    ].join('\n');
  }

  /**
   * Flatten ExtractedVariables into the 8 placeholder keys the templates use.
   * Falls back to sensible Chinese defaults so unresolved variables never
   * leak `{{key_person_name}}` into the rendered narrative.
   */
  private buildVariableMap(variables: ExtractedVariables): Record<string, string> {
    const primary = variables.key_persons[0];
    const quality = primary?.relationship_quality ?? 0;
    return {
      key_person_name: primary?.name ?? '对方',
      trigger_event: variables.trigger_event,
      relationship_with_person: primary?.relationship ?? '家人',
      relationship_type: primary?.relationship ?? '朋友',
      emotion_state: variables.primary_emotion,
      coping_strategy: variables.coping_strategy,
      family_dynamic: quality > 0 ? '亲近' : quality < 0 ? '疏远' : '平常',
      relationship_history: '相处了一段时间',
    };
  }

  /**
   * Walk the template's scenes, pulling each scene's filled narrative
   * from M3's payload. If M3 forgot a scene (shouldn't happen, but
   * defensive), we manualFill it so the script stays consistent.
   */
  private assembleScript(
    template: ScriptTemplate,
    payload: M3GenerationPayload,
    variableMap: Record<string, string>,
  ): GeneratedScript {
    const scenes: GeneratedScene[] = template.scenes.map((scene) => ({
      scene_id: scene.scene_id,
      scene_number: scene.scene_number,
      narrative:
        payload.filled_narratives[scene.scene_id] ??
        this.manualFill(scene.narrative_template, variableMap),
      choices: scene.choices.map((choice) => ({
        choice_id: choice.choice_id,
        text: choice.text,
        dimension_signals: choice.dimension_signals,
        weight: 1,
      })),
      next_scene_map: scene.next_scene_map,
    }));

    return {
      template_id: payload.template_id || template.template_id,
      scenes,
      metadata: {
        expected_duration_minutes: scenes.length * 2,
        dimension_coverage: payload.dimension_coverage,
        variable_usage: payload.variable_usage,
      },
    };
  }

  /**
   * Fully-degraded path: use the template verbatim with manual variable
   * substitution. metadata.dimension_coverage is derived from the first
   * choice's signals so we never report an empty coverage list.
   */
  private fallbackManualFill(
    template: ScriptTemplate,
    variableMap: Record<string, string>,
  ): GeneratedScript {
    const firstChoice = template.scenes[0]?.choices[0];
    const dimensionCoverage = firstChoice
      ? Object.keys(firstChoice.dimension_signals)
      : [];
    return this.assembleScript(
      template,
      {
        template_id: template.template_id,
        filled_narratives: {},
        dimension_coverage: dimensionCoverage,
        variable_usage: Object.fromEntries(
          Object.keys(variableMap).map((k) => [k, true]),
        ),
      },
      variableMap,
    );
  }

  /**
   * Replace `{{key}}` placeholders in a narrative_template with values
   * from variableMap. Unknown placeholders are left as `{{key}}` so they
   * are easy to spot in QA.
   */
  private manualFill(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
  }
}