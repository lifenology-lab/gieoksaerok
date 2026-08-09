const INTENT_RULES = [
  {
    intent: "meal",
    keywords: ["밥", "식사", "아침", "점심", "저녁", "먹었", "뭐 먹"],
  },
  {
    intent: "way_home",
    keywords: ["집", "가는 길", "어떻게 가지", "돌아가", "귀가"],
  },
  {
    intent: "schedule",
    keywords: ["일정", "약속", "해야", "할 일", "뭐 하지"],
  },
  {
    intent: "place",
    keywords: ["여기", "어디", "장소"],
  },
];

export function classifyPatientQuestion(transcript) {
  const normalizedTranscript = transcript.trim().toLowerCase();

  const matchedRule = INTENT_RULES.find((rule) => {
    return rule.keywords.some((keyword) => normalizedTranscript.includes(keyword));
  });

  return {
    intent: matchedRule?.intent || "unknown",
    confidence: matchedRule ? 0.9 : 0,
    transcript: transcript.trim(),
  };
}
