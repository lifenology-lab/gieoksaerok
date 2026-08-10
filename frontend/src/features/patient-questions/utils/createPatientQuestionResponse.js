const RESPONSES = {
  way_home: {
    title: "집으로 가는 길을 함께 확인해볼게요",
    message: "지금은 가까운 보호자에게 현재 위치를 알려달라고 말해보세요.",
    suggestion: "혼자 서두르지 말고, 안전한 곳에서 잠시 기다려도 괜찮아요.",
  },
  schedule: {
    title: "오늘 해야 할 일을 확인해볼게요",
    message: "한 번에 하나씩 떠올려 보면 괜찮아요.",
    suggestion: "필요하면 보호자에게 오늘의 약속이나 할 일을 물어보세요.",
  },
  place: {
    title: "지금 있는 곳을 함께 살펴볼까요?",
    message: "주변의 익숙한 물건이나 표지판을 천천히 확인해보세요.",
    suggestion: "필요하면 보호자에게 지금 있는 곳을 물어봐도 괜찮아요.",
  },
  unknown: {
    title: "질문을 조금 더 들려주세요",
    message: "질문을 정확히 이해하지 못했어요.",
    suggestion: "천천히 다시 말씀하시거나, 다른 표현으로 입력해 주세요.",
  },
};

function formatMealRecordTime(eatenAt) {
  const date = new Date(eatenAt);

  if (Number.isNaN(date.getTime())) {
    return "기록된 시간";
  }

  const period = date.getHours() < 12 ? "오전" : "오후";
  const hours = date.getHours() % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${period} ${hours}시 ${minutes}분`;
}

function createMealResponse(mealRecord) {
  if (!mealRecord) {
    return {
      title: "최근 식사 기록이 없어요",
      message: "아직 남겨진 식사 기록을 찾지 못했어요.",
      suggestion: "식사를 하셨다면 다음에 식사 기록을 남겨둘 수 있어요.",
    };
  }

  const mealDetails = [mealRecord.mealLabel];

  if (mealRecord.menu) {
    mealDetails.push(mealRecord.menu);
  }

  return {
    title: "가장 최근 식사 기록이에요",
    message: `${formatMealRecordTime(mealRecord.eatenAt)}에 ${mealDetails.join(" · ")} 기록이 있어요.`,
    suggestion: mealRecord.memo || "기록을 확인했어요. 천천히 생각해 봐도 괜찮아요.",
  };
}

export function createPatientQuestionResponse(intent, { mealRecord } = {}) {
  if (intent === "meal") {
    return createMealResponse(mealRecord);
  }

  return RESPONSES[intent] || RESPONSES.unknown;
}
