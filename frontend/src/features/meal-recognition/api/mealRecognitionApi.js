import {
  mockMealRecordsEmpty,
  mockMealRecordsWithRecentMeal,
  mockMealRecordsWithoutRecentMeal,
} from "../data/mockMealRecords";
import { classifyMealScene } from "../model/mobilenetMealClassifier";
import { findRecentMealRecord } from "../utils/mealRecordUtils";

const MOCK_DELAY_MS = 1000;

const wait = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

// 현재 테스트에 사용할 mock 식사 기록 데이터
// mockMealRecordsEmpty, mockMealRecordsWithRecentMeal, mockMealRecordsWithoutRecentMeal 중 선택
const MOCK_MEAL_RECORDS = mockMealRecordsWithRecentMeal;

export async function detectMealScene(videoElement) {
  await wait(MOCK_DELAY_MS);

  // 식사 상황인지 추론
  const mealSceneResult = await classifyMealScene(videoElement);

  // 식사 상황이 아닌 경우
  if (!mealSceneResult.isMealScene) {
    return {
      isMealScene: false,
      hasRecentMealRecord: false,
      recentMealRecord: null,
      predictions: mealSceneResult.predictions,
      mealRelatedPrediction: mealSceneResult.mealRelatedPrediction,
      card: null,
    };
  }

  // 최근 식사 기록 가져오기
  const recentMealRecord = findRecentMealRecord(MOCK_MEAL_RECORDS);

  // 최근 식사 기록이 있는 경우
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

  // 최근 식사 기록이 없는 경우
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
