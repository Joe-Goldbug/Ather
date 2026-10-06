// apps/api/src/modules/assessment/dynamic-script.tokens.ts
//
// DI tokens for dynamic-script module providers. Kept in a separate file
// so services can import them without creating a circular dependency
// with dynamic-script.module.ts.

export const COMPLETENESS_CONFIG = 'COMPLETENESS_CONFIG';
export const EVIDENCE_BRIDGE_CONFIG = 'EVIDENCE_BRIDGE_CONFIG';