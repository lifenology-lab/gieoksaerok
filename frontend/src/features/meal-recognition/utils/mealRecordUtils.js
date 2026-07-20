/*
 * 최근 3시간 이내 식사 기록이 있는지 확인
 * 최근 식사 기록이 있는 경우 가장 최신 식사 기록 리턴
 * 최근 식사 기록이 없는 경우 null 리턴
 */

const DEFAULT_RECENT_MEAL_HOURS = 3;

export function findRecentMealRecord(
  mealRecords,
  baseTime = new Date(),
  recentHours = DEFAULT_RECENT_MEAL_HOURS,
) {
  if (!Array.isArray(mealRecords) || mealRecords.length === 0) {
    return null;
  }

  const baseTimeMs = new Date(baseTime).getTime();
  const recentThresholdMs = recentHours * 60 * 60 * 1000;

  const recentMealRecords = mealRecords
    .filter((mealRecord) => {
      if (!mealRecord.eatenAt) {
        return false;
      }

      const eatenAtMs = new Date(mealRecord.eatenAt).getTime();

      if (Number.isNaN(eatenAtMs)) {
        return false;
      }

      const diffMs = baseTimeMs - eatenAtMs;

      // 기준 시간으로부터 recentHours 시간 이내의 식사 기록만 필터링
      return diffMs >= 0 && diffMs <= recentThresholdMs;
    })
    .sort((a, b) => {
      // 최근 식사 순으로 정렬
      return new Date(b.eatenAt).getTime() - new Date(a.eatenAt).getTime();
    });

  return recentMealRecords[0] || null;
}
