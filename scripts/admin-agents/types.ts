/**
 * Core Data Contracts for EVA Admin Agent Automation System
 */

export type JourneyGoal =
  | 'register-only'
  | 'assessment-dropoff'
  | 'assessment-complete'
  | 'confirm-result'
  | 'partial-result'
  | 'refute-result'
  | 'clarify-result'
  | 'returning-user';

export type AgentLifecycleState =
  | 'pending'
  | 'created'
  | 'authenticated'
  | 'round_started'
  | 'answering'
  | 'dropped'
  | 'completed'
  | 'feedback_submitted'
  | 'verified'
  | 'failed';

export interface PersonaTraits {
  skepticism: number; // 0.0 - 1.0 (Higher = more likely to refute/clarify)
  introspection: number; // 0.0 - 1.0 (Higher = more nuanced/thoughtful)
  stressLevel: number; // 0.0 - 1.0
  defensiveness: number; // 0.0 - 1.0 (Higher = guards boundaries)
  verbosity: 'short' | 'medium' | 'detailed';
  preferredThemeLens: 'emotion' | 'workplace' | 'social' | 'relationship' | 'self_evaluation';
}

export interface Persona {
  id: string;
  name: string;
  roleDescription: string;
  traits: PersonaTraits;
  goal: JourneyGoal;
  dropoffQuestionOrdinal?: number; // 1-indexed, e.g. 2 means drop off when Q02 arrives
  feedbackExplanationTemplate?: string;
  correctionText?: string;
}

export interface TestIdentity {
  agentId: string;
  batchId: string;
  email: string;
  userId?: string;
  sessionToken?: string;
  clientIp: string;
}

export interface ExpectedOutcome {
  expectedRounds: number;
  expectedAnswers: number;
  expectedRoundStatus: 'in_progress' | 'completed' | 'none';
  expectedFeedbackAction: 'confirm' | 'partial' | 'refute' | 'clarify' | null;
  expectedAdminStage: '已注册' | '测评中' | '完成测评' | '持续校准';
}

export interface SyntheticUserAgent {
  identity: TestIdentity;
  persona: Persona;
  state: AgentLifecycleState;
  expectedOutcome: ExpectedOutcome;
  actualOutcome?: {
    roundIds: string[];
    answeredCount: number;
    completedRounds: number;
    feedbackAction?: string;
    correctionCount: number;
    adminStage?: string;
  };
  error?: string;
  fallbackUsed?: boolean;
}

export interface AgentExecutionEvent {
  timestamp: string;
  batchId: string;
  agentId: string;
  eventType: string;
  payload: Record<string, unknown>;
  durationMs?: number;
}

export interface BatchManifest {
  batchId: string;
  seed: string;
  targetCount: number;
  createdAt: string;
  agentIds: string[];
  expectedSummary: {
    totalUsers: number;
    registeredOnly: number;
    dropoff: number;
    completed: number;
    confirmed: number;
    partial: number;
    refuted: number;
    clarified: number;
    returning: number;
  };
}

export interface SingleAgentValidationResult {
  agentId: string;
  email: string;
  userId?: string;
  passed: boolean;
  mismatches: string[];
  expected: ExpectedOutcome;
  databaseActual?: Record<string, unknown>;
  adminActual?: Record<string, unknown>;
}

export interface BatchValidationReport {
  batchId: string;
  timestamp: string;
  totalAgents: number;
  passedCount: number;
  failedCount: number;
  tripleConsistencyRate: number; // 0 - 100%
  results: SingleAgentValidationResult[];
}
