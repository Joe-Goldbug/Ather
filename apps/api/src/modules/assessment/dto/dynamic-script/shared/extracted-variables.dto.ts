// apps/api/src/modules/assessment/dto/dynamic-script/shared/extracted-variables.dto.ts
export interface KeyPerson {
  name: string;
  relationship: string;
  relationship_quality: number; // -1 to 1
}

export interface ExtractedVariables {
  scenario_type: 'work' | 'family' | 'romantic' | 'social' | 'other';
  trigger_event: string;
  primary_emotion: string;
  emotion_intensity: number; // 0-1
  emotional_response: string;
  root_cause?: string;
  recent_context?: string;
  key_persons: KeyPerson[];
  coping_strategy: string;
  immediate_action?: string;
}

export interface Progress {
  scenario: number;
  emotion: number;
  background: number;
  relationship: number;
}

export interface ConversationTurn {
  role: 'ai' | 'user';
  content: string;
  timestamp: number;
}