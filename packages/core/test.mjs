import assert from 'node:assert/strict';
import {
  applyScriptResult,
  computeAssessmentEvidenceEvents,
  computeUBVEvidenceEvents,
  createMemory,
  generateScriptResult,
  SCORED_SCENARIO_IDS,
} from './src/index.ts';

const scenarioIds = SCORED_SCENARIO_IDS;

function choices(overrides = {}) {
  return scenarioIds.map((scenarioId) => ({
    scenarioId,
    choice: overrides[scenarioId] ?? 'B',
    timestamp: 1,
  }));
}

function result(overrides = {}) {
  return generateScriptResult(choices(overrides), 'zh-CN');
}

function ubvValue(memory, dimension) {
  return memory.ubv?.[dimension]?.value;
}

function assertBetween(value, min, max, label) {
  assert.equal(typeof value, 'number', `${label} should be numeric`);
  assert.ok(value >= min && value <= max, `${label} expected ${min}-${max}, got ${value}`);
}

// ---------------------------------------------------------------------------
// Phase 1: deterministic assessment rule contracts
// Direction + range assertions — robust against future scenario additions.
// ---------------------------------------------------------------------------

{
  // trust: only one scenario touches trust_threshold/boundary_strength → exact values hold
  const guarded = result({ trust: 'A' });
  assert.equal(guarded.vector.trust_threshold, 0.9);
  assert.equal(guarded.vector.boundary_strength, 0.9);

  const open = result({ trust: 'D' });
  assert.equal(open.vector.trust_threshold, 0.18);
  assert.equal(open.vector.boundary_strength, 0.22);
}

{
  // conflict: multiple scenarios contribute → use directional + range assertions
  const avoidant = result({ conflict: 'A' });
  assert.equal(avoidant.vector.conflict_style, 'avoidant');
  // conflict A=0.2 averaged with conflict_friend B=0.82 and motive_silence B=0.20
  assertBetween(avoidant.vector.conflict_score, 0.2, 0.55, 'avoidant conflict_score');

  const confrontational = result({ conflict: 'B' });
  assert.equal(confrontational.vector.conflict_style, 'confrontational');
  assertBetween(confrontational.vector.conflict_score, 0.55, 0.95, 'confrontational conflict_score');

  // Directional contract: confrontational > avoidant
  assert.ok(
    confrontational.vector.conflict_score > avoidant.vector.conflict_score,
    'confrontational conflict_score should be higher than avoidant',
  );
}

{
  // stress: multiple scenarios contribute → range + direction
  const activated = result({ stress: 'B' });
  assert.equal(activated.vector.stress_response, 'activation');
  assertBetween(activated.vector.stress_score, 0.5, 0.95, 'activated stress_score');

  const ruminating = result({ stress: 'A' });
  assert.equal(ruminating.vector.stress_response, 'rumination');
  assertBetween(ruminating.vector.stress_score, 0.4, 0.9, 'ruminating stress_score');
}

// ---------------------------------------------------------------------------
// Script -> UBV mapping contracts. These use public APIs only.
// UBV uses prior + weighted posterior — assert calibrated ranges.
// ---------------------------------------------------------------------------

{
  const guardedMemory = applyScriptResult(createMemory('u1'), result({ trust: 'A' }));
  const openMemory = applyScriptResult(createMemory('u2'), result({ trust: 'D' }));

  assertBetween(ubvValue(guardedMemory, 'trustBoundaries'), 25, 45, 'guarded trustBoundaries');
  assertBetween(ubvValue(openMemory, 'trustBoundaries'), 55, 75, 'open trustBoundaries');

  // Directional: open > guarded
  assert.ok(
    ubvValue(openMemory, 'trustBoundaries') > ubvValue(guardedMemory, 'trustBoundaries'),
    'open trustBoundaries should be higher than guarded',
  );
}

{
  const avoidantMemory = applyScriptResult(createMemory('u3'), result({ conflict: 'A' }));
  const directMemory = applyScriptResult(createMemory('u4'), result({ conflict: 'B' }));

  assertBetween(ubvValue(avoidantMemory, 'conflictResponse'), 35, 55, 'avoidant conflictResponse');
  assertBetween(ubvValue(directMemory, 'conflictResponse'), 50, 70, 'direct conflictResponse');

  // Directional: direct > avoidant
  assert.ok(
    ubvValue(directMemory, 'conflictResponse') > ubvValue(avoidantMemory, 'conflictResponse'),
    'direct conflictResponse should be higher than avoidant',
  );
}

{
  const activatedMemory = applyScriptResult(createMemory('u5'), result({ stress: 'B' }));
  const mindfulMemory = applyScriptResult(createMemory('u6'), result({ stress: 'D' }));

  assertBetween(ubvValue(activatedMemory, 'stressResponse'), 45, 65, 'activated stressResponse');
  assertBetween(ubvValue(mindfulMemory, 'stressResponse'), 38, 58, 'mindful stressResponse');
}

// ---------------------------------------------------------------------------
// Evidence contracts: structured assessment is high-weight; chat ignores noise.
// ---------------------------------------------------------------------------

{
  const assessmentEvents = computeAssessmentEvidenceEvents('u7', 'assessment_1', result({ conflict: 'B' }));
  const conflictEvent = assessmentEvents.find((event) => event.dimension === 'conflictResponse');

  assert.ok(conflictEvent, 'assessment should emit conflictResponse evidence');
  assert.equal(conflictEvent.sourceType, 'test');
  assert.equal(conflictEvent.weight, 0.8);
  assert.equal(typeof conflictEvent.confidence, 'number');
}

{
  const oldUBV = applyScriptResult(createMemory('u8'), result({ conflict: 'A' })).ubv;
  const sameUBV = structuredClone(oldUBV);
  const noNoiseEvents = computeUBVEvidenceEvents('u8', 'msg_1', oldUBV, sameUBV, '只是补充一句');

  assert.equal(noNoiseEvents.length, 0, 'unchanged UBV should not emit noisy chat evidence');
}

console.log('EVA core accuracy contracts passed');
