export interface TemplateChoice {
  choice_id: string;
  text: string;
  dimension_signals: Record<string, number>;
}

export interface TemplateScene {
  scene_id: string;
  scene_number: number;
  narrative_template: string;
  choices: TemplateChoice[];
  next_scene_map: Record<string, string>;
}

export interface ScriptTemplate {
  template_id: string;
  required_variables: string[];
  optional_variables: string[];
  scenes: TemplateScene[];
}

export const workConflictTemplate: ScriptTemplate = {
  template_id: 'work-conflict-v1',
  required_variables: ['key_person_name', 'trigger_event'],
  optional_variables: ['emotion_state', 'relationship_history', 'coping_strategy'],

  scenes: [
    {
      scene_id: 'scene-1',
      scene_number: 1,
      narrative_template:
        '你在参加团队周会，{{key_person_name}}突然公开质疑{{trigger_event}}。会议室瞬间安静下来，所有人看着你。',
      choices: [
        {
          choice_id: 'confront',
          text: '当场反驳，维护自己的方案',
          dimension_signals: { conflictResponse: 0.8, selfCognition: 0.6 },
        },
        {
          choice_id: 'silence-private',
          text: '保持沉默，会后私下沟通',
          dimension_signals: { conflictResponse: 0.3, emotionRegulation: 0.7, growthOrientation: 0.6 },
        },
        {
          choice_id: 'escalate',
          text: '会后直接找领导反映',
          dimension_signals: { conflictResponse: 0.5, helpSeekingPattern: 0.7, attachment: 0.4 },
        },
      ],
      next_scene_map: {
        confront: 'scene-2a',
        'silence-private': 'scene-2b',
        escalate: 'scene-2c',
      },
    },
    {
      scene_id: 'scene-2a',
      scene_number: 2,
      narrative_template:
        '你和{{key_person_name}}在会议室里公开争论，气氛变得紧张。其他同事开始低头看手机。',
      choices: [
        {
          choice_id: 'win-or-lose',
          text: '坚持到底，必须证明自己是对的',
          dimension_signals: { conflictResponse: 0.9, achievementMotivation: 0.8, shameSensitivity: 0.4 },
        },
        {
          choice_id: 'compromise',
          text: '试着找一个折中方案',
          dimension_signals: { conflictResponse: 0.5, emotionRegulation: 0.8, growthOrientation: 0.7 },
        },
        {
          choice_id: 'walk-away',
          text: '突然觉得没必要继续，转身离开会议室',
          dimension_signals: { emotionRegulation: 0.3, stressResponse: 0.7, shameSensitivity: 0.7 },
        },
      ],
      next_scene_map: {
        'win-or-lose': 'scene-3-end',
        compromise: 'scene-3-end',
        'walk-away': 'scene-3-end',
      },
    },
    {
      scene_id: 'scene-2b',
      scene_number: 2,
      narrative_template:
        '会议结束后，你约{{key_person_name}}到走廊单独聊。TA的表情有些意外。',
      choices: [
        {
          choice_id: 'honest',
          text: '坦诚说出你的感受和想法',
          dimension_signals: { emotionRegulation: 0.8, narrativeCoherence: 0.7, trustBoundaries: 0.6 },
        },
        {
          choice_id: 'curious',
          text: '先问TA为什么这么做',
          dimension_signals: { emotionRegulation: 0.7, growthOrientation: 0.7, socialEnergy: 0.5 },
        },
        {
          choice_id: 'cold',
          text: '冷淡地说"没事"，转身离开',
          dimension_signals: { emotionRegulation: 0.2, trustBoundaries: 0.2, shameSensitivity: 0.6 },
        },
      ],
      next_scene_map: {
        honest: 'scene-3-end',
        curious: 'scene-3-end',
        cold: 'scene-3-end',
      },
    },
    {
      scene_id: 'scene-2c',
      scene_number: 2,
      narrative_template:
        '你找到领导，反映{{key_person_name}}在会上的行为。领导听完，沉默了。',
      choices: [
        {
          choice_id: 'factual',
          text: '只陈述事实，不带情绪',
          dimension_signals: { emotionRegulation: 0.8, narrativeCoherence: 0.8, helpSeekingPattern: 0.5 },
        },
        {
          choice_id: 'emotional',
          text: '表达了你的委屈和不满',
          dimension_signals: { emotionRegulation: 0.4, helpSeekingPattern: 0.8, shameSensitivity: 0.6 },
        },
        {
          choice_id: 'withdraw',
          text: '意识到这样不对，主动撤回',
          dimension_signals: { selfCognition: 0.7, growthOrientation: 0.8, emotionRegulation: 0.7 },
        },
      ],
      next_scene_map: {
        factual: 'scene-3-end',
        emotional: 'scene-3-end',
        withdraw: 'scene-3-end',
      },
    },
    {
      scene_id: 'scene-3-end',
      scene_number: 3,
      narrative_template: '事情过去了。你坐在工位上，想起刚才的对话。',
      choices: [
        {
          choice_id: 'reflect',
          text: '认真反思，下次可以做得更好',
          dimension_signals: { selfCognition: 0.8, growthOrientation: 0.9, narrativeCoherence: 0.7 },
        },
        {
          choice_id: 'dismiss',
          text: '告诉自己这不算什么',
          dimension_signals: { emotionRegulation: 0.4, shameSensitivity: 0.7, selfCognition: 0.3 },
        },
        {
          choice_id: 'plan',
          text: '开始思考如何避免类似情况',
          dimension_signals: { selfCognition: 0.7, growthOrientation: 0.8 },
        },
      ],
      next_scene_map: { reflect: 'end', dismiss: 'end', plan: 'end' },
    },
  ],
};
