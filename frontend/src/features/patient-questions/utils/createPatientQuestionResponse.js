const RESPONSES = {
  person: {
    title: "앞에 계신 분을 확인하고 있어요",
    message: "카메라에 얼굴이 잘 보이도록 잠시 기다려 주세요.",
    suggestion: "얼굴을 찾지 못하면 가까운 분에게 이름을 물어봐도 괜찮아요.",
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

function createPersonResponse(person, isUnknownPerson) {
  if (isUnknownPerson) {
    return {
      title: "등록되지 않은 분이에요",
      message: "앞에 계신 분의 정보가 아직 기억새록에 없어요.",
      suggestion: "이 분의 정보를 기억새록에 등록해 둘까요?",
      action: "register-unknown-person",
      actionLabel: "등록할까요?",
    };
  }

  if (!person?.name) {
    return RESPONSES.person;
  }

  const personLabel = person.relationship
    ? `${person.relationship} ${person.name}님`
    : `${person.name}님`;
  const summary = person.latest_summary?.card;
  const memoryHint = summary?.title || summary?.body;

  return {
    title: "앞에 계신 분을 찾았어요",
    message: `앞에 계신 분은 ${personLabel}이에요.`,
    suggestion: memoryHint || "천천히 인사를 건네 보셔도 괜찮아요.",
  };
}

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

export function createPatientQuestionResponse(
  intent,
  { mealRecord, person, isUnknownPerson = false } = {},
) {
  if (intent === "meal") {
    return createMealResponse(mealRecord);
  }

  if (intent === "person") {
    return createPersonResponse(person, isUnknownPerson);
  }

  return RESPONSES[intent] || RESPONSES.unknown;
}
