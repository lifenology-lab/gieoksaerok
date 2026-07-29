const SUPPRESS_MEAL_NOTICE_HOURS = 1;
// 최근 1시간 이내 식사 기록이 있으면 같은 식사 맥락으로 보고 안내를 띄우지 않음

const RECENT_MEAL_NOTICE_HOURS = 3;
// 최근 3시간 이내 식사 기록이 있으면 이전 식사 기록을 안내함

export const MEAL_CONTEXT_RESULT_TYPES = {
  MEAL_NOTICE_SUPPRESSED: "meal_notice_suppressed",
  RECENT_MEAL_FOUND: "recent_meal_found",
  MEAL_DETECTED_WITHOUT_RECORD: "meal_detected_without_record",
};

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
