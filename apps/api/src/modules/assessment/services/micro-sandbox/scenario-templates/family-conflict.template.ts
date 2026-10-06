import type { ScriptTemplate } from './work-conflict.template.js';

export const familyConflictTemplate: ScriptTemplate = {
  template_id: 'family-conflict-v1',
  required_variables: ['key_person_name', 'relationship_with_person', 'trigger_event'],
  optional_variables: ['emotion_state', 'family_dynamic'],

  scenes: [
    {
      scene_id: 'scene-1',
      scene_number: 1,
      narrative_template:
        '{{key_person_name}}（你的{{relationship_with_person}}）又在饭桌上提起{{trigger_event}}。你握着筷子的手停了一下。',
      choices: [
        {
          choice_id: 'engage',
          text: '直接回应，展开讨论',
          dimension_signals: { conflictResponse: 0.7, attachment: 0.5, linguisticExtraversion: 0.7 },
        },
        {
          choice_id: 'deflect',
          text: '转移话题，不想再争',
          dimension_signals: { conflictResponse: 0.3, emotionRegulation: 0.5, shameSensitivity: 0.6 },
        },
        {
          choice_id: 'leave',
          text: '放下筷子，起身离开餐桌',
          dimension_signals: { conflictResponse: 0.2, stressResponse: 0.7, emotionRegulation: 0.3 },
        },
      ],
      next_scene_map: {
        engage: 'scene-2a',
        deflect: 'scene-2b',
        leave: 'scene-2c',
      },
    },
    {
      scene_id: 'scene-2a',
      scene_number: 2,
      narrative_template:
        '你们的对话越来越激烈，{{key_person_name}}说了一句让你特别受伤的话。',
      choices: [
        {
          choice_id: 'speak-back',
          text: '把你心里一直压着的话说出来',
          dimension_signals: { narrativeCoherence: 0.8, attachment: 0.6, shameSensitivity: 0.5 },
        },
        {
          choice_id: 'hold-back',
          text: '忍住，把委屈咽下去',
          dimension_signals: { emotionRegulation: 0.7, shameSensitivity: 0.8, narrativeCoherence: 0.3 },
        },
        {
          choice_id: 'tears',
          text: '眼泪一下子就出来了',
          dimension_signals: { emotionalGranularity: 0.8, shameSensitivity: 0.7, emotionRegulation: 0.3 },
        },
      ],
      next_scene_map: {
        'speak-back': 'scene-3-end',
        'hold-back': 'scene-3-end',
        tears: 'scene-3-end',
      },
    },
    {
      scene_id: 'scene-2b',
      scene_number: 2,
      narrative_template:
        '话题被岔开了，但你能感觉到{{key_person_name}}在等机会再提。',
      choices: [
        {
          choice_id: 'pretend-fine',
          text: '假装一切正常',
          dimension_signals: { emotionRegulation: 0.4, shameSensitivity: 0.7, narrativeCoherence: 0.3 },
        },
        {
          choice_id: 'after-meal',
          text: '饭后单独找TA聊',
          dimension_signals: { emotionRegulation: 0.7, attachment: 0.6, growthOrientation: 0.6 },
        },
        {
          choice_id: 'avoid',
          text: '收拾完就回自己房间',
          dimension_signals: { trustBoundaries: 0.3, shameSensitivity: 0.5, socialEnergy: 0.2 },
        },
      ],
      next_scene_map: {
        'pretend-fine': 'scene-3-end',
        'after-meal': 'scene-3-end',
        avoid: 'scene-3-end',
      },
    },
    {
      scene_id: 'scene-2c',
      scene_number: 2,
      narrative_template: '你回到房间，关上门。手机屏幕亮了。',
      choices: [
        {
          choice_id: 'vent-text',
          text: '给朋友发消息倾诉',
          dimension_signals: { helpSeekingPattern: 0.8, socialEnergy: 0.5, emotionRegulation: 0.6 },
        },
        {
          choice_id: 'silent',
          text: '盯着天花板发呆',
          dimension_signals: { selfCognition: 0.6, shameSensitivity: 0.6, emotionRegulation: 0.4 },
        },
        {
          choice_id: 'journal',
          text: '打开日记本记录下今天的感受',
          dimension_signals: {
            emotionalGranularity: 0.8,
            narrativeCoherence: 0.7,
            selfCognition: 0.7,
          },
        },
      ],
      next_scene_map: {
        'vent-text': 'scene-3-end',
        silent: 'scene-3-end',
        journal: 'scene-3-end',
      },
    },
    {
      scene_id: 'scene-3-end',
      scene_number: 3,
      narrative_template: '夜深了。{{key_person_name}}在门外轻轻敲了两下。',
      choices: [
        {
          choice_id: 'open-door',
          text: '开门，TA站在门口',
          dimension_signals: { attachment: 0.7, trustBoundaries: 0.6, emotionRegulation: 0.6 },
        },
        {
          choice_id: 'pretend-asleep',
          text: '假装已经睡着了',
          dimension_signals: { attachment: 0.3, shameSensitivity: 0.7, trustBoundaries: 0.3 },
        },
        {
          choice_id: 'go-out',
          text: '你打开门主动走出去',
          dimension_signals: { attachment: 0.8, growthOrientation: 0.7, emotionRegulation: 0.7 },
        },
      ],
      next_scene_map: { 'open-door': 'end', 'pretend-asleep': 'end', 'go-out': 'end' },
    },
  ],
};