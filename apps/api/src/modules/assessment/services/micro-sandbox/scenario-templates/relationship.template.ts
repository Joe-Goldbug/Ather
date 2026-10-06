import type { ScriptTemplate } from './work-conflict.template.js';

export const relationshipTemplate: ScriptTemplate = {
  template_id: 'relationship-v1',
  required_variables: ['key_person_name', 'relationship_type', 'trigger_event'],
  optional_variables: ['emotion_state', 'relationship_history'],

  scenes: [
    {
      scene_id: 'scene-1',
      scene_number: 1,
      narrative_template:
        '深夜，{{key_person_name}}（你的{{relationship_type}}）发来一条消息：关于{{trigger_event}}。你盯着屏幕，心跳加速。',
      choices: [
        {
          choice_id: 'reply-warm',
          text: '认真回复，表达你的在意',
          dimension_signals: { attachment: 0.8, emotionRegulation: 0.6, linguisticExtraversion: 0.7 },
        },
        {
          choice_id: 'reply-short',
          text: '敷衍地回了一个字',
          dimension_signals: { attachment: 0.3, trustBoundaries: 0.3, shameSensitivity: 0.6 },
        },
        {
          choice_id: 'read-only',
          text: '读了但不回，让消息停在那里',
          dimension_signals: { trustBoundaries: 0.5, emotionRegulation: 0.4, shameSensitivity: 0.7 },
        },
      ],
      next_scene_map: {
        'reply-warm': 'scene-2a',
        'reply-short': 'scene-2b',
        'read-only': 'scene-2b',
      },
    },
    {
      scene_id: 'scene-2a',
      scene_number: 2,
      narrative_template: '你们开始打字聊天，气氛从紧张慢慢变成了一种奇怪的温暖。',
      choices: [
        {
          choice_id: 'share-deep',
          text: '分享你最近一直在想的事',
          dimension_signals: { trustBoundaries: 0.8, narrativeCoherence: 0.8, attachment: 0.7 },
        },
        {
          choice_id: 'test-boundary',
          text: '试探性地问一个你一直不敢问的问题',
          dimension_signals: { trustBoundaries: 0.7, selfCognition: 0.7, growthOrientation: 0.7 },
        },
        {
          choice_id: 'pull-back',
          text: '突然觉得自己说得太多，停下来了',
          dimension_signals: { shameSensitivity: 0.7, trustBoundaries: 0.3, emotionRegulation: 0.5 },
        },
      ],
      next_scene_map: {
        'share-deep': 'scene-3-end',
        'test-boundary': 'scene-3-end',
        'pull-back': 'scene-3-end',
      },
    },
    {
      scene_id: 'scene-2b',
      scene_number: 2,
      narrative_template: '对方又发了一条："你还在吗？"',
      choices: [
        {
          choice_id: 'reply-now',
          text: '这次终于回了',
          dimension_signals: { attachment: 0.7, trustBoundaries: 0.5, shameSensitivity: 0.5 },
        },
        {
          choice_id: 'reply-tomorrow',
          text: '"明天再说吧"',
          dimension_signals: { emotionRegulation: 0.5, trustBoundaries: 0.3, attachment: 0.4 },
        },
        {
          choice_id: 'block',
          text: '屏蔽了对话框',
          dimension_signals: { trustBoundaries: 0.1, attachment: 0.1, shameSensitivity: 0.8 },
        },
      ],
      next_scene_map: {
        'reply-now': 'scene-3-end',
        'reply-tomorrow': 'scene-3-end',
        block: 'scene-3-end',
      },
    },
    {
      scene_id: 'scene-3-end',
      scene_number: 3,
      narrative_template: '你关掉手机，躺在床上，想着和{{key_person_name}}的关系。',
      choices: [
        {
          choice_id: 'want-close',
          text: '想靠近，但不确定对方怎么想',
          dimension_signals: { attachment: 0.7, trustBoundaries: 0.4, selfCognition: 0.6 },
        },
        {
          choice_id: 'protect-self',
          text: '告诉自己，要保护好自己',
          dimension_signals: { trustBoundaries: 0.7, selfCognition: 0.7, attachment: 0.5 },
        },
        {
          choice_id: 'decide',
          text: '做了一个关于这段关系的决定',
          dimension_signals: { selfCognition: 0.8, growthOrientation: 0.8, attachment: 0.6 },
        },
      ],
      next_scene_map: { 'want-close': 'end', 'protect-self': 'end', decide: 'end' },
    },
  ],
};