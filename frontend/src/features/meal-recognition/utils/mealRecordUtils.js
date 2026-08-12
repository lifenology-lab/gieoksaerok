const SUPPRESS_MEAL_NOTICE_HOURS = 1;
// 최근 1시간 이내 식사 기록이 있으면 같은 식사 맥락으로 보고 안내를 띄우지 않음

const RECENT_MEAL_NOTICE_HOURS = 3;
// 최근 3시간 이내 식사 기록이 있으면 이전 식사 기록을 안내함

export const MEAL_CONTEXT_RESULT_TYPES = {
  MEAL_NOTICE_SUPPRESSED: "meal_notice_suppressed",
  RECENT_MEAL_FOUND: "recent_meal_found",
  MEAL_DETECTED_WITHOUT_RECORD: "meal_detected_without_record",
};

const MEAL_TYPE_LABELS = {
  breakfast: "아침",
  lunch: "점심",
  dinner: "저녁",
  snack: "간식",
  unknown: "식사",
};

// 환자에게 식사 종류를 다시 묻지 않기 위해 기록 시각으로만 식사 종류를 제안한다.
// 일반적인 식사 시간대 밖의 기록은 임의로 간식으로 분류하지 않는다.
export function getSuggestedMealType(eatenAt = new Date()) {
  const date = new Date(eatenAt);

  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  const hour = date.getHours();

  if (hour >= 5 && hour < 10) {
    return "breakfast";
  }

  if (hour >= 10 && hour < 14) {
    return "lunch";
  }

  if (hour >= 14 && hour < 17) {
    return "snack";
  }

  if (hour >= 17 && hour < 21) {
    return "dinner";
  }

  return "unknown";
}

// 백엔드 MealRecord 응답(snake_case)을 식사 인식 화면에서 사용하는 형태로 변환
export function mapMealRecordFromApi(mealRecord) {
  if (!mealRecord || typeof mealRecord !== "object") {
    return null;
  }

  const mealType = mealRecord.meal_type || "unknown";

  return {
    id: mealRecord.id,
    mealType,
    mealLabel: MEAL_TYPE_LABELS[mealType] || MEAL_TYPE_LABELS.unknown,
    eatenAt: mealRecord.eaten_at || null,
    menu: mealRecord.menu || null,
    memo: mealRecord.memo || null,
    sceneImage: mealRecord.scene_image || null,
    source: mealRecord.source || null,
  };
}

export function mapMealRecordsFromApi(mealRecords) {
  if (!Array.isArray(mealRecords)) {
    return [];
  }

  return mealRecords.map(mapMealRecordFromApi).filter(Boolean);
}

// 기준 시간(baseTime)에서 대상 시간(targetTime)이 몇 분 전인지 계산
function getElapsedMinutes(baseTime, targetTime) {
  const baseTimeMs = new Date(baseTime).getTime();
  const targetTimeMs = new Date(targetTime).getTime();

  if (Number.isNaN(baseTimeMs) || Number.isNaN(targetTimeMs)) {
    return null;
  }

  const diffMs = baseTimeMs - targetTimeMs;

  // 미래 시점의 식사 기록은 현재 식사 맥락 판단에서 제외
  if (diffMs < 0) {
    return null;
  }

  return Math.floor(diffMs / (60 * 1000));
}

// 식사 기록 중 가장 최근에 기록된 식사 하나를 찾음
export function findLatestMealRecord(mealRecords) {
  if (!Array.isArray(mealRecords) || mealRecords.length === 0) {
    return null;
  }

  const validMealRecords = mealRecords.filter((mealRecord) => {
    if (!mealRecord.eatenAt) {
      return false;
    }

    const eatenAtMs = new Date(mealRecord.eatenAt).getTime();

    return !Number.isNaN(eatenAtMs);
  });

  if (validMealRecords.length === 0) {
    return null;
  }

  return validMealRecords.sort((a, b) => {
    return new Date(b.eatenAt).getTime() - new Date(a.eatenAt).getTime();
  })[0];
}

// 최근 식사 기록을 기준으로 식사 안내를 띄울지 판단
export function getMealContextResult(
  mealRecords,
  baseTime = new Date(),
  options = {},
) {
  const suppressMealNoticeHours =
    options.suppressMealNoticeHours ?? SUPPRESS_MEAL_NOTICE_HOURS;

  const recentMealNoticeHours =
    options.recentMealNoticeHours ?? RECENT_MEAL_NOTICE_HOURS;

  const latestMealRecord = findLatestMealRecord(mealRecords);

  if (!latestMealRecord) {
    return {
      type: MEAL_CONTEXT_RESULT_TYPES.MEAL_DETECTED_WITHOUT_RECORD,
      mealRecord: null,
      elapsedMinutes: null,
    };
  }

  const elapsedMinutes = getElapsedMinutes(baseTime, latestMealRecord.eatenAt);

  if (elapsedMinutes === null) {
    return {
      type: MEAL_CONTEXT_RESULT_TYPES.MEAL_DETECTED_WITHOUT_RECORD,
      mealRecord: null,
      elapsedMinutes: null,
    };
  }

  const suppressMealNoticeMinutes = suppressMealNoticeHours * 60;
  const recentMealNoticeMinutes = recentMealNoticeHours * 60;

  // 최근 1시간 이내 식사 기록이 있으면 같은 식사 맥락으로 보고 안내를 띄우지 않음
  if (elapsedMinutes <= suppressMealNoticeMinutes) {
    return {
      type: MEAL_CONTEXT_RESULT_TYPES.MEAL_NOTICE_SUPPRESSED,
      mealRecord: latestMealRecord,
      elapsedMinutes,
    };
  }

  // 최근 1~3시간 이내 식사 기록이 있으면 이전 식사 기록을 안내함
  if (elapsedMinutes <= recentMealNoticeMinutes) {
    return {
      type: MEAL_CONTEXT_RESULT_TYPES.RECENT_MEAL_FOUND,
      mealRecord: latestMealRecord,
      elapsedMinutes,
    };
  }

  // 최근 식사 기록이 없거나 3시간을 초과한 경우 새 식사 맥락으로 봄
  return {
    type: MEAL_CONTEXT_RESULT_TYPES.MEAL_DETECTED_WITHOUT_RECORD,
    mealRecord: null,
    elapsedMinutes,
  };
}
