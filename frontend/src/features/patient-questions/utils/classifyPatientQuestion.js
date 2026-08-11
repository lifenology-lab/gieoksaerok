const INTENT_RULES = [
  {
    intent: "person",
    patterns: [
      ["누구더라", 5],
      ["누구지", 5],
      ["누구야", 5],
      ["누구", 4],
      ["성함", 4],
      ["이름", 3],
      ["이 사람이", 4],
      ["저 사람이", 4],
      ["이분", 4],
      ["저분", 4],
      ["앞에 있는 사람", 4],
      ["옆에 있는 사람", 4],
    ],
  },
  {
    intent: "meal",
    patterns: [
      ["무엇을 먹", 5],
      ["뭐 먹", 5],
      ["식사", 4],
      ["아침", 3],
      ["점심", 3],
      ["저녁", 3],
      ["밥", 2],
      ["먹었", 2],
    ],
  },
  {
    intent: "way_home",
    patterns: [
      ["집에 가", 5],
      ["집으로 가", 5],
      ["집에 어떻게", 5],
      ["집으로 어떻게", 5],
      ["집에 갈", 5],
      ["집으로 갈", 5],
      ["집에 가려", 5],
      ["집으로 가려", 5],
      ["집에 가야", 4],
      ["가는 길", 4],
      ["어떻게 가지", 4],
      ["어떻게 가", 4],
      ["돌아가", 3],
      ["귀가", 4],
    ],
  },
  {
    intent: "schedule",
    patterns: [
      ["해야 할 일", 5],
      ["할 일이", 4],
      ["뭘 해야", 4],
      ["뭐 하지", 4],
      ["일정", 4],
      ["약속", 3],
    ],
  },
  {
    intent: "time",
    patterns: [
      ["몇 시", 5],
      ["몇시", 5],
      ["지금 시간", 5],
      ["시간이", 4],
      ["오늘 며칠", 5],
      ["오늘은 며칠", 5],
      ["무슨 요일", 5],
      ["요일이", 4],
      ["날짜", 4],
      ["언제", 2],
    ],
  },
  {
    intent: "place",
    patterns: [
      ["여기가 어디", 5],
      ["여긴 어디", 5],
      ["어디에 있", 4],
      ["어디야", 3],
      ["어디지", 4],
      ["어디였", 4],
      ["어디더라", 4],
      ["장소", 3],
      ["어딘지", 3],
    ],
  },
];

function normalizeQuestion(transcript) {
  return transcript
    .trim()
    .toLowerCase()
    .replace(/[?!,.~]/g, " ")
    .replace(/\s+/g, " ");
}

function matchesPattern(question, compactQuestion, pattern) {
  return (
    question.includes(pattern) ||
    compactQuestion.includes(pattern.replace(/\s+/g, ""))
  );
}

function getIntentCandidates(question) {
  const compactQuestion = question.replace(/\s+/g, "");

  return INTENT_RULES.map((rule) => {
    const matchedPatterns = rule.patterns.filter(([pattern]) =>
      matchesPattern(question, compactQuestion, pattern),
    );
    const highestPatternScore = Math.max(
      ...matchedPatterns.map(([, score]) => score),
      0,
    );

    return {
      intent: rule.intent,
      matchedPatterns: matchedPatterns.map(([pattern]) => pattern),
      score:
        highestPatternScore + Math.min(Math.max(matchedPatterns.length - 1, 0), 2),
    };
  })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);
}

function getConfidence(topCandidate, nextCandidate) {
  if (!topCandidate) {
    return 0;
  }

  const scoreGap = topCandidate.score - (nextCandidate?.score || 0);

  if (nextCandidate?.score >= 3) {
    return 0.75;
  }

  if (topCandidate.score >= 5 && scoreGap >= 2) {
    return 0.95;
  }

  if (topCandidate.score >= 4 && scoreGap >= 2) {
    return 0.88;
  }

  if (topCandidate.score >= 3 && scoreGap >= 1) {
    return 0.75;
  }

  return 0.45;
}

export function classifyPatientQuestion(transcript) {
  const normalizedTranscript = normalizeQuestion(transcript);
  const [topCandidate, nextCandidate] = getIntentCandidates(normalizedTranscript);
  const confidence = getConfidence(topCandidate, nextCandidate);

  return {
    intent: topCandidate?.intent || "unknown",
    confidence,
    transcript: transcript.trim(),
    matchedPatterns: topCandidate?.matchedPatterns || [],
    needsModelClassification: confidence < 0.8,
  };
}
