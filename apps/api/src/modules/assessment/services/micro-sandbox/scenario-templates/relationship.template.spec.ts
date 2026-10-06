import { describe, test, expect } from '@jest/globals';
import { relationshipTemplate } from './relationship.template.js';

const VALID_DIMS = [
  'trustBoundaries',
  'conflictResponse',
  'attachment',
  'emotionRegulation',
  'stressResponse',
  'achievementMotivation',
  'selfCognition',
  'socialEnergy',
  'emotionalGranularity',
  'growthOrientation',
  'shameSensitivity',
  'helpSeekingPattern',
  'linguisticExtraversion',
  'narrativeCoherence',
];

describe('relationshipTemplate', () => {
  test('has 3-5 scenes', () => {
    expect(relationshipTemplate.scenes.length).toBeGreaterThanOrEqual(3);
    expect(relationshipTemplate.scenes.length).toBeLessThanOrEqual(5);
  });

  test('each scene has 2-4 choices with valid dimension signals', () => {
    for (const scene of relationshipTemplate.scenes) {
      expect(scene.choices.length).toBeGreaterThanOrEqual(2);
      expect(scene.choices.length).toBeLessThanOrEqual(4);
      for (const choice of scene.choices) {
        for (const [dim, signal] of Object.entries(choice.dimension_signals)) {
          expect(signal).toBeGreaterThanOrEqual(0);
          expect(signal).toBeLessThanOrEqual(1);
          expect(VALID_DIMS).toContain(dim);
        }
      }
    }
  });

  test('next_scene_map covers every choice id', () => {
    for (const scene of relationshipTemplate.scenes) {
      for (const choice of scene.choices) {
        expect(scene.next_scene_map[choice.choice_id]).toBeDefined();
      }
    }
  });

  test('all branches end at scene index 4 or earlier', () => {
    const visited = new Set<string>();
    const walk = (sceneIdx: number) => {
      if (visited.has(String(sceneIdx))) return;
      visited.add(String(sceneIdx));
      if (sceneIdx >= relationshipTemplate.scenes.length - 1) return;
      const scene = relationshipTemplate.scenes[sceneIdx];
      for (const choice of scene.choices) {
        const nextId = scene.next_scene_map[choice.choice_id];
        if (nextId === 'end') continue;
        const nextIdx = parseInt(nextId.replace(/scene-/, ''), 10) - 1;
        if (nextIdx >= 0) walk(nextIdx);
      }
    };
    walk(0);
    expect(Math.max(...[...visited].map(Number))).toBeLessThan(5);
  });
});