/*
 * 임시 식사 기록 데이터
 * 현재로부터 3시간 이내 식사 기록이 있는 경우와
 * 현재로부터 3시간 이내 식사 기록이 없는 경우
 */

export const mockMealRecordsWithRecentMeal = [
  {
    id: 1,
    mealType: "lunch",
    mealLabel: "점심",
    eatenAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 현재로부터 2시간 전
    menu: "죽과 반찬",
    memo: "보호자가 점심 식사 완료로 기록함",
  },
];

export const mockMealRecordsWithoutRecentMeal = [
  {
    id: 1,
    mealType: "breakfast",
    mealLabel: "아침",
    eatenAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 현재로부터 5시간 전
    menu: "삶은 달걀과 주스",
    memo: "5시간 전 식사 기록",
  },
];

export const mockMealRecordsEmpty = [];
