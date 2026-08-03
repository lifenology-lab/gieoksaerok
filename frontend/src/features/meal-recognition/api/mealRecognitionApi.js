import { request } from "../../../shared/api/client";
import { classifyMealScene } from "../model/teachableMachineMealClassifier";
import {
  getMealContextResult,
  mapMealRecordsFromApi,
  MEAL_CONTEXT_RESULT_TYPES,
} from "../utils/mealRecordUtils";

// 최근 식사 기록을 받아 식사 인식 화면에서 사용하는 형태로 반환
export async function fetchRecentMealRecords() {
  const mealRecords = await request("/api/meal-records/recent/");

  return mapMealRecordsFromApi(mealRecords);
}

// 식사 상황이 보이는 source (video)와 식사 기록들을 받아서
// 식사 상황인지 추론하고 최근 식사 기록 유무에 따른 object를 리턴
export async function detectMealScene(srcElement, mealRecords = []) {
  // 식사 상황인지 추론
  const mealSceneResult = await classifyMealScene(srcElement);

  // 식사 상황이 아닌 경우
  if (!mealSceneResult.isMealScene) {
    return {
      type: "non_meal_scene",
      isMealScene: false,
      hasRecentMealRecord: false,
      recentMealRecord: null,
      predictions: mealSceneResult.predictions,
      mealSceneProbability: mealSceneResult.mealSceneProbability,
      mealRelatedPrediction: mealSceneResult.mealRelatedPrediction,
      card: null,
    };
  }

  // 식사 맥락 가져오기
  const mealContextResult = getMealContextResult(mealRecords);

  // 최근 1시간 이내 식사 기록이 있는 경우 같은 식사 맥락으로 판단
  if (
    mealContextResult.type === MEAL_CONTEXT_RESULT_TYPES.MEAL_NOTICE_SUPPRESSED
  ) {
    return {
      type: "meal_notice_suppressed",
      isMealScene: true,
      hasRecentMealRecord: true,
      recentMealRecord: mealContextResult.mealRecord,
      elapsedMinutes: mealContextResult.elapsedMinutes,
      predictions: mealSceneResult.predictions,
      mealSceneProbability: mealSceneResult.mealSceneProbability,
      mealRelatedPrediction: mealSceneResult.mealRelatedPrediction,
      card: null,
    };
  }

  // 최근 식사 기록이 있는 경우
  if (mealContextResult.type === MEAL_CONTEXT_RESULT_TYPES.RECENT_MEAL_FOUND) {
    const recentMealRecord = mealContextResult.mealRecord;

    return {
      type: "recent_meal_found",
      isMealScene: true,
      hasRecentMealRecord: true,
      recentMealRecord,
      elapsedMinutes: recentMealRecord.elapsedMinutes,
      predictions: mealSceneResult.predictions,
      mealSceneProbability: mealSceneResult.mealSceneProbability,
      mealRelatedPrediction: mealSceneResult.mealRelatedPrediction,
      card: {
        type: "recent_meal_found",
        title: "최근 식사 기록이 있어요",
        message: `${recentMealRecord.mealLabel} 식사 기록이 확인되었어요.`,
        suggestion: recentMealRecord.menu
          ? `${recentMealRecord.menu}를 드셨어요. 지금은 따뜻한 차를 마시며 쉬어볼까요?`
          : "최근 식사 기록이 있어요. 지금은 잠시 쉬어도 괜찮아요.",
        primaryActionLabel: "식사 기록 보기",
        secondaryActionLabel: "안내 닫기",
      },
    };
  }

  // 최근 식사 기록이 없는 경우
  return {
    type: "meal_detected_without_record",
    isMealScene: true,
    hasRecentMealRecord: false,
    recentMealRecord: null,
    elapsedMinutes: mealContextResult.elapsedMinutes,
    predictions: mealSceneResult.predictions,
    mealSceneProbability: mealSceneResult.mealSceneProbability,
    mealRelatedPrediction: mealSceneResult.mealRelatedPrediction,
    card: {
      type: "meal_detected_without_record",
      title: "식사 중이신가요?",
      message: "최근 식사 기록은 확인되지 않았어요.",
      suggestion: "식사 중이라면 식사 기록을 남길 수 있어요.",
      primaryActionLabel: "식사 기록하기",
      secondaryActionLabel: "안내 닫기",
    },
  };
}
