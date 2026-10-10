function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true' || value?.trim() === '1';
}

function pilotUser(userId: string, value: string | undefined): boolean {
  return (value ?? '').split(',').map((item) => item.trim()).filter(Boolean).includes(userId);
}

export function understandingCapabilities(userId: string) {
  const resultFollowup = enabled(process.env.EVA_RESULT_FOLLOWUP_V1)
    || pilotUser(userId, process.env.EVA_RESULT_FOLLOWUP_PILOT_USER_IDS);
  const homeChat = enabled(process.env.EVA_HOME_CHAT_V1)
    || pilotUser(userId, process.env.EVA_HOME_CHAT_PILOT_USER_IDS);
  return { result_followup: resultFollowup, home_chat: homeChat };
}
