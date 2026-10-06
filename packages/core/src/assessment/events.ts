export interface AssessmentNodeEvent {
  eventId: string;
  userId?: string;
  roundId: string;
  sessionId?: string;
  contentVersion: string;   // e.g. "v1.4-script-conflict"
  nodeId: string;           // 剧情节点 ID (如 "scene_01_office")
  sceneId?: string;         // 场景标识
  eventName: 
    | 'round_started'
    | 'node_presented'      // 节点展示 (记录 presented_at)
    | 'choice_selected'     // 选项点击
    | 'answer_submitted'    // 提交决策 (计算 duration_ms)
    | 'branch_entered'      // 进入分支剧情
    | 'node_abandoned'      // 页面离开/中途放弃
    | 'round_completed'     // 剧本通关
    | 'result_viewed'       // 查看洞察报告
    | 'result_confirmed'    // 确认画像
    | 'result_refuted'      // 反驳画像
    | 'feedback_submitted'; // 提交工单
  choiceId?: string;        // 用户选择的选项 ID
  durationMs?: number;      // 停留毫秒数 (node_presented -> answer_submitted)
  previousNodeId?: string;
  nextNodeId?: string;
  pathId?: string;          // 路径轨迹标识
  occurredAt: string;       // ISO UTC 时间
  metadata?: Record<string, unknown>;
}
