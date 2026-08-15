const RESPONSES = {
  person: {
    title: "앞에 계신 분을 확인하고 있어요",
    message: "카메라에 얼굴이 잘 보이도록 잠시 기다려 주세요.",
    suggestion: "얼굴을 찾지 못하면 가까운 분에게 이름을 물어봐도 괜찮아요.",
  },
  place: {
    title: "지금 있는 곳을 함께 살펴볼까요?",
    message: "주변의 익숙한 물건이나 표지판을 천천히 확인해보세요.",
    suggestion: "필요하면 보호자에게 지금 있는 곳을 물어봐도 괜찮아요.",
    familyHelpAction: "request-family-help",
    familyHelpActionLabel: "가족에게 도움 요청하기",
  },
  way_home: {
    title: "집에 가는 길을 함께 확인해 볼까요?",
    message: "혼자 서두르지 말고, 지금 있는 곳에서 잠시 안전하게 기다려 주세요.",
    suggestion: "가까운 분이나 보호자에게 집에 가는 방법을 물어보세요.",
    familyHelpAction: "request-family-help",
    familyHelpActionLabel: "가족에게 도움 요청하기",
  },
  unknown: {
    title: "질문을 조금 더 들려주세요",
    message: "질문을 정확히 이해하지 못했어요.",
    suggestion: "천천히 다시 말씀하시거나, 다른 표현으로 입력해 주세요.",
  },
};

export function createFamilyHelpRequestDemoResponse() {
  return {
    title: "가족에게 도움을 요청할 준비가 되었어요",
    message:
      "가족에게 지금 있는 곳이나 귀가 방법을 확인하기 어렵다고 알려드릴 수 있어요.",
    suggestion:
      "지금은 데모 화면이에요. 실제 연락이나 위치 정보는 전송되지 않았어요.",
    isFamilyHelpRequestDemo: true,
  };
}

const WEEKDAY_LABELS = [
  "일요일",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일",
];

function createTimeResponse() {
  const now = new Date();
  const period = now.getHours() < 12 ? "오전" : "오후";
  const hours = now.getHours() % 12 || 12;
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const timeOfDay = now.getHours() < 12 ? "오전" : now.getHours() < 18 ? "오후" : "저녁";

  return {
    title: "지금의 시간을 알려드릴게요",
    message: `오늘은 ${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAY_LABELS[now.getDay()]}이에요. 지금은 ${period} ${hours}시 ${minutes}분이에요.`,
    suggestion: `지금은 ${timeOfDay}이에요. 천천히 확인해도 괜찮아요.`,
  };
}

function createPersonResponse(person, isUnknownPerson) {
  if (isUnknownPerson) {
    return {
      title: "등록되지 않은 분이에요",
      message: "앞에 계신 분의 정보가 아직 기억새록에 없어요.",
      suggestion: "이 분의 정보를 기억새록에 등록해 둘까요?",
      action: "register-unknown-person",
      actionLabel: "네, 등록할래요.",
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
    action: "open-person-memory",
    actionLabel: "추억 살펴보기",
    person,
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

const MEAL_TYPE_KEYWORDS = {
  breakfast: "아침",
  lunch: "점심",
  dinner: "저녁",
  snack: "간식",
};

function getQuestionedMealType(question) {
  const normalizedQuestion = question?.replace(/\s/g, "") || "";

  return Object.entries(MEAL_TYPE_KEYWORDS).find(([, keyword]) =>
    normalizedQuestion.includes(keyword),
  )?.[0] || null;
}

function isSameDay(leftDate, rightDate) {
  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getDate() === rightDate.getDate()
  );
}

function getTodayMealRecords(mealRecords) {
  const now = new Date();

  return mealRecords.filter((mealRecord) => {
    const eatenAt = new Date(mealRecord.eatenAt);

    return !Number.isNaN(eatenAt.getTime()) && isSameDay(eatenAt, now);
  });
}

function createMealResponse(mealRecords, question) {
  const questionedMealType = getQuestionedMealType(question);
  const mealRecord = questionedMealType
    ? mealRecords.find((record) => record.mealType === questionedMealType)
    : mealRecords[0] || null;
  const mealLabel = questionedMealType
    ? MEAL_TYPE_KEYWORDS[questionedMealType]
    : "최근";

  if (!mealRecord) {
    return {
      title: `${mealLabel} 식사 기록이 없어요`,
      message: questionedMealType
        ? `오늘 기록에서 ${mealLabel} 식사를 찾지 못했어요.`
        : "아직 남겨진 식사 기록을 찾지 못했어요.",
      suggestion: "식사를 하셨다면 다음에 식사 기록을 남겨둘 수 있어요.",
      action: "open-memory-overview",
      actionLabel: "기억 살펴보기",
      overviewTab: "calendar",
    };
  }

  const mealDetails = [mealRecord.mealLabel];

  if (mealRecord.menu) {
    mealDetails.push(mealRecord.menu);
  }

  const todayMealRecords = getTodayMealRecords(mealRecords);
  const todayRecordMessage = todayMealRecords.length
    ? `오늘 식사 기록은 모두 ${todayMealRecords.length}개예요.`
    : "오늘의 다른 식사 기록은 아직 없어요.";

  return {
    title: questionedMealType
      ? `${mealLabel} 식사 기록이에요`
      : "가장 최근 식사 기록이에요",
    message: `${formatMealRecordTime(mealRecord.eatenAt)}에 ${mealDetails.join(" · ")} 기록이 있어요.`,
    suggestion: mealRecord.memo || todayRecordMessage,
    action: "open-meal-records",
    actionLabel: "식사 기록 보기",
  };
}

function getPromiseDate(promise) {
  if (promise.scheduled_at) {
    const scheduledAt = new Date(promise.scheduled_at);

    if (!Number.isNaN(scheduledAt.getTime())) {
      return scheduledAt;
    }
  }

  if (promise.scheduled_date) {
    const scheduledDate = new Date(`${promise.scheduled_date}T00:00:00`);

    if (!Number.isNaN(scheduledDate.getTime())) {
      return scheduledDate;
    }
  }

  return null;
}

function formatPromiseSchedule(promise) {
  const scheduledDate = getPromiseDate(promise);

  if (!scheduledDate) {
    return promise.time_label || "예정된 약속";
  }

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const dayLabel = isSameDay(scheduledDate, now)
    ? "오늘"
    : isSameDay(scheduledDate, tomorrow)
      ? "내일"
      : `${scheduledDate.getMonth() + 1}월 ${scheduledDate.getDate()}일`;

  if (!promise.scheduled_at) {
    return promise.time_label ? `${dayLabel} ${promise.time_label}` : dayLabel;
  }

  const period = scheduledDate.getHours() < 12 ? "오전" : "오후";
  const hours = scheduledDate.getHours() % 12 || 12;
  const minutes = String(scheduledDate.getMinutes()).padStart(2, "0");

  return `${dayLabel} ${period} ${hours}시 ${minutes}분`;
}

function createScheduleResponse(promises) {
  const nextPromise = promises[0];

  if (!nextPromise) {
    return {
      title: "예정된 약속이 없어요",
      message: "지금 확인할 수 있는 약속이나 할 일이 없어요.",
      suggestion: "새 약속이 생기면 기억새록에 남겨둘 수 있어요.",
      action: "open-memory-overview",
      actionLabel: "기억 살펴보기",
      overviewTab: "calendar",
    };
  }

  const promiseTitle = nextPromise.title || "예정된 약속";
  const promiseDescription = nextPromise.description?.trim();
  const personLabel = nextPromise.person_name
    ? nextPromise.person_relationship
      ? `${nextPromise.person_relationship} ${nextPromise.person_name}님`
      : `${nextPromise.person_name}님`
    : "";
  const appointmentWith = personLabel ? `${personLabel}과 ` : "";
  const upcomingPromises = promises.slice(1, 3).map((promise) => {
    const promisePersonLabel = promise.person_name
      ? promise.person_relationship
        ? `${promise.person_relationship} ${promise.person_name}님과 `
        : `${promise.person_name}님과 `
      : "";

    return `${formatPromiseSchedule(promise)} · ${promisePersonLabel}${promise.title || "예정된 약속"}`;
  });
  const remainingPromiseCount = Math.max(promises.length - 3, 0);

  return {
    title: "가까운 약속을 알려드릴게요",
    message: `${formatPromiseSchedule(nextPromise)}에 ${appointmentWith}${promiseTitle} 일정이 있어요.`,
    suggestion: promiseDescription || "천천히 준비해도 괜찮아요.",
    upcomingPromises,
    remainingPromiseCount,
    action: "open-memory-overview",
    actionLabel: "기억 살펴보기",
    overviewTab: "calendar",
  };
}

export function createPatientQuestionResponse(
  intent,
  {
    mealRecords = [],
    person,
    isUnknownPerson = false,
    promises = [],
    question = "",
  } = {},
) {
  if (intent === "meal") {
    return createMealResponse(mealRecords, question);
  }

  if (intent === "person") {
    return createPersonResponse(person, isUnknownPerson);
  }

  if (intent === "time") {
    return createTimeResponse();
  }

  if (intent === "schedule") {
    return createScheduleResponse(promises);
  }

  return RESPONSES[intent] || RESPONSES.unknown;
}
