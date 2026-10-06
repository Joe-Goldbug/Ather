// apps/api/src/modules/assessment/dto/dynamic-script/shared/generated-script.dto.ts
export interface GeneratedChoice {
  choice_id: string;
  text: string;
  dimension_signals: Record<string, number>;
  weight: number;
}

export interface GeneratedScene {
  scene_id: string;
  scene_number: number;
  narrative: string;        // filled with variables
  choices: GeneratedChoice[];
  next_scene_map: Record<string, string>;
}

export interface GeneratedScript {
  template_id: string;
  scenes: GeneratedScene[];
  metadata: {
    expected_duration_minutes: number;
    dimension_coverage: string[];
    variable_usage: Record<string, boolean>;
  };
}