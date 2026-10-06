// apps/web/components/dynamic-script/script-play-view.tsx
//
// Scene-by-scene player for a generated dynamic script. Each scene shows
// a narrative + 2-4 choices; selecting a choice advances to the next
// scene via next_scene_map. The playthrough log is kept locally so the
// parent can hand it to the post-experience view.
//
// This component is *presentation only* — it does not call the backend.
// The page that owns it should already have fetched the script via
// useDynamicScriptSession.script.

'use client';

import { useRef, useState } from 'react';
import type { ScriptScene, ScriptChoice, CompleteDynamicSuccessResponse } from '@/lib/api-dynamic-script';

export interface ScriptPlayViewProps {
  script: CompleteDynamicSuccessResponse;
  onComplete: (path: { sceneId: string; choiceId: string }[]) => void;
  labels: {
    scene: (n: number) => string;
    chooseHint: string;
    progressLabel: (current: number, total: number) => string;
    submitChoice: string;
    finish: string;
  };
}

interface SceneVisit {
  sceneId: string;
  sceneNumber: number;
  choiceId: string;
}

export function ScriptPlayView({ script, onComplete, labels }: ScriptPlayViewProps) {
  const [currentSceneId, setCurrentSceneId] = useState<string>(script.script.scenes[0]?.scene_id ?? '');
  const [visits, setVisits] = useState<SceneVisit[]>([]);
  const completed = useRef(false);

  const sceneIndex = script.script.scenes.findIndex((s) => s.scene_id === currentSceneId);
  const scene: ScriptScene | undefined = script.script.scenes[sceneIndex];

  if (!scene) {
    // Defensive: missing scene id in next_scene_map
    return (
      <main className="report-error">
        <h1>剧本无法继续</h1>
        <p>场景映射中断，请重试。</p>
      </main>
    );
  }

  function handleChoice(choice: ScriptChoice) {
    if (completed.current) return;
    const nextId = scene!.next_scene_map[choice.choice_id];
    const updatedVisits = [
      ...visits,
      { sceneId: scene!.scene_id, sceneNumber: scene!.scene_number, choiceId: choice.choice_id },
    ];
    setVisits(updatedVisits);
    if (nextId && nextId !== 'end') {
      setCurrentSceneId(nextId);
    } else {
      completed.current = true;
      onComplete(
        updatedVisits.map((v) => ({ sceneId: v.sceneId, choiceId: v.choiceId })),
      );
    }
  }

  const totalScenes = script.script.scenes.length;

  return (
    <main className="report-container">
      <header className="report-header">
        <p className="report-date">{labels.scene(scene.scene_number)}</p>
        <p className="script-meta" role="status">
          {labels.progressLabel(Math.min(visits.length + 1, totalScenes), totalScenes)}
        </p>
      </header>

      <section className="report-section share-card-hero">
        <p>{scene.narrative}</p>
      </section>

      <section className="report-section">
        <p className="choose-hint" role="status">{labels.chooseHint}</p>
        <div className="choices">
          {scene.choices.map((choice) => (
            <button
              key={choice.choice_id}
              type="button"
              onClick={() => handleChoice(choice)}
              disabled={completed.current}
              className="choice-button"
              aria-label={choice.text}
            >
              <span>{choice.text}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
