import {
  mockMealRecordsEmpty,
  mockMealRecordsWithRecentMeal,
  mockMealRecordsWithoutRecentMeal,
} from "../data/mockMealRecords";
import { findRecentMealRecord } from "../utils/mealRecordUtils";

const MOCK_DELAY_MS = 1000;
const MOCK_IS_MEAL_SCENE = true; // 식사 상황 여부

const wait = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

export async function detectMealScene() {
  await wait(MOCK_DELAY_MS);

  if (!MOCK_IS_MEAL_SCENE) {
    return {
      isMealScene: false,
      hasRecentMealRecord: false,
      recentMealRecord: null,
      card: null,
    };
  }

  const recentMealRecord = findRecentMealRecord(
    mockMealRecordsWithoutRecentMeal,
  );

  if (recentMealRecord) {
    return {
      isMealScene: true,
      hasRecentMealRecord: true,
      recentMealRecord,
      card: {
        type: "recent_meal_found",
        title: "최근 식사 기록이 있어요",
        message: `${recentMealRecord.mealLabel} 식사 기록이 확인되었어요.`,
        suggestion: `${recentMealRecord.menu}를 드셨어요. 지금은 따뜻한 차를 마시며 쉬어볼까요?`,
        primaryActionLabel: "식사 기록 보기",
        secondaryActionLabel: "안내 닫기",
      },
    };
  }

  return {
    isMealScene: true,
    hasRecentMealRecord: false,
    recentMealRecord: null,
    card: {
      type: "meal_detected_without_record",
      title: "식사 중이신가요?",
      message: "최근 3시간 이내 식사 기록은 확인되지 않았어요.",
      suggestion: "식사 중이라면 식사 기록을 남길 수 있어요.",
      primaryActionLabel: "식사 기록하기",
      secondaryActionLabel: "안내 닫기",
    },
  };
}
