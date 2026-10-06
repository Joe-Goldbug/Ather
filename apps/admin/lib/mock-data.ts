import type { AdminSnapshot, AdminUserSummary, FeedbackItem } from './types';

const users: AdminUserSummary[] = [
  { id: 'usr_7F29A', maskedEmail: 'li***@gmail.com', registeredAt: '2026-08-26', lastActiveAt: '今天 09:42', maskedLastIp: '203.0.xxx.xxx', loginCount: 18, assessmentRoundCount: 3, feedbackCount: 2, correctionCount: 4, portraitConfidence: 78, status: 'active', stage: '持续校准', device: 'Chrome · macOS', location: '上海, CN' },
  { id: 'usr_4C81D', maskedEmail: 'an***@outlook.com', registeredAt: '2026-08-24', lastActiveAt: '昨天 21:08', maskedLastIp: '198.51.xxx.xxx', loginCount: 9, assessmentRoundCount: 1, feedbackCount: 1, correctionCount: 0, portraitConfidence: 54, status: 'active', stage: '完成基线', device: 'Safari · iPhone', location: '北京, CN' },
  { id: 'usr_9B13K', maskedEmail: 'mo***@hey.com', registeredAt: '2026-08-21', lastActiveAt: '2026-08-27', maskedLastIp: '192.0.xxx.xxx', loginCount: 5, assessmentRoundCount: 1, feedbackCount: 0, correctionCount: 1, portraitConfidence: 61, status: 'inactive', stage: '完成测评', device: 'Chrome · Windows', location: 'Toronto, CA' },
  { id: 'usr_2E64P', maskedEmail: 'ya***@qq.com', registeredAt: '2026-08-19', lastActiveAt: '今天 11:16', maskedLastIp: '203.0.xxx.xxx', loginCount: 27, assessmentRoundCount: 5, feedbackCount: 3, correctionCount: 8, portraitConfidence: 86, status: 'active', stage: '持续校准', device: 'Chrome · Windows', location: '杭州, CN' },
  { id: 'usr_5A42Q', maskedEmail: 'so***@icloud.com', registeredAt: '2026-08-18', lastActiveAt: null, maskedLastIp: '198.51.xxx.xxx', loginCount: 2, assessmentRoundCount: 0, feedbackCount: 1, correctionCount: 0, portraitConfidence: null, status: 'inactive', stage: '已注册', device: 'Safari · iPhone', location: '大阪, JP' },
  { id: 'usr_8D02M', maskedEmail: 'ka***@proton.me', registeredAt: '2026-08-15', lastActiveAt: '2026-08-25', maskedLastIp: '192.0.xxx.xxx', loginCount: 12, assessmentRoundCount: 2, feedbackCount: 0, correctionCount: 2, portraitConfidence: 69, status: 'active', stage: '现实记录', device: 'Firefox · Linux', location: 'Berlin, DE' },
];

const feedback: FeedbackItem[] = [
  { id: 'fb_1042', title: '画像里的“边界感”描述与我的原话不一致', original: '我说的是这一次工作场景，不是我平时都这样。希望可以看到它用了哪些证据。', category: '画像准确性', page: 'Profile', impact: 24, severity: '高', owner: 'Ethan', status: '处理中', age: '24 分钟前' },
  { id: 'fb_1039', title: '微沙盒完成后不知道下一步去哪里', original: '做完选择后页面停住了，我以为还在加载。', category: '流程问题', page: 'Micro-sandbox', impact: 18, severity: '中', owner: '—', status: '新反馈', age: '2 小时前' },
  { id: 'fb_1033', title: '希望可以删除一条现实记录', original: '有些内容只是当时的情绪，我不希望它一直影响画像。', category: '隐私与控制', page: 'Daily Mirror', impact: 31, severity: '高', owner: 'Mia', status: '计划改进', age: '昨天' },
  { id: 'fb_1027', title: '测评题目在手机上阅读很舒服', original: '选项比一般心理测试更像现实里的选择。', category: '体验反馈', page: 'Assessment', impact: 12, severity: '低', owner: '—', status: '已确认', age: '2 天前' },
  { id: 'fb_1018', title: '登录验证码等待时间太长', original: '第一次登录等了快一分钟，不确定有没有发送成功。', category: '登录异常', page: 'Auth', impact: 9, severity: '中', owner: 'Leo', status: '已解决', age: '4 天前' },
];

export function getMockSnapshot(): AdminSnapshot {
  return {
    mode: 'mock',
    authenticated: true,
    overview: {
      metrics: { registrations: 1284, activeUsers: 732, completionRate: 64, pendingFeedback: 5 },
      activity: [{ day: '08/22', users: 42 }, { day: '08/23', users: 57 }, { day: '08/24', users: 51 }, { day: '08/25', users: 74 }, { day: '08/26', users: 68 }, { day: '08/27', users: 89 }, { day: '08/28', users: 96 }],
      funnel: [{ label: '注册', value: 100, count: 1284 }, { label: '开始测评', value: 82, count: 1053 }, { label: '完成测评', value: 64, count: 822 }, { label: '查看画像', value: 0, count: 0, status: 'unavailable' }, { label: '首次校准', value: 31, count: 398 }],
      updatedAt: new Date().toISOString(),
      excludesSyntheticUsers: false,
    },
    users,
    feedback,
    quality: {
      confirmationRate: 58.0,
      rebuttalRate: 14.0,
      sufficientEvidenceCount: 421,
      correctionEffectivenessRate: null,
      disputedDimensions: [
        { dimension: 'boundary', dimensionLabel: '边界感', disputeCount: 32, rate: 18.4 },
        { dimension: 'stress', dimensionLabel: '压力反应', disputeCount: 19, rate: 12.1 },
        { dimension: 'social', dimensionLabel: '社交能量', disputeCount: 11, rate: 8.7 },
      ],
      versionComparisons: [
        { version: 'v1.4', isCurrent: true, sampleCount: 822, completionRate: 64.0, confirmationRate: 58.0, rebuttalRate: 14.0, status: 'active' },
        { version: 'v1.3', isCurrent: false, sampleCount: 1106, completionRate: 61.8, confirmationRate: 52.0, rebuttalRate: 17.2, status: 'deprecated' },
      ],
    },
  };
}
