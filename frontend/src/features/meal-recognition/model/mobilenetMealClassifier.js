/** pretrained MobileNet 로드
 * video frame classify
 * 식사 관련 label인지 판별 (rule-based)
 * TODO: transfer learning & fine-tuning을 통한 성능 개선
 */
import * as tf from "@tensorflow/tfjs";
import * as mobilenet from "@tensorflow-models/mobilenet";

// 식사 관련 라벨
// 이 키워드가 예측 라벨에 포함되면 식사 상황으로 추정
const MEAL_RELATED_KEYWORDS = [
  "plate",
  "bowl",
  "cup",
  "spoon",
  "fork",
  "knife",
  "dining",
  "restaurant",
  "tray",
  "banana",
  "orange",
  "pizza",
  "hotdog",
  "sandwich",
  "ice cream",
];

const MEAL_CONFIDENCE_THRESHOLD = 0.2;

let mobilenetModel = null;

// 모델 불러오기
async function loadMobileNetModel() {
  if (mobilenetModel) {
    return mobilenetModel;
  }

  await tf.ready();

  mobilenetModel = await mobilenet.load();

  return mobilenetModel;
}

// 식사 관련 라벨이 포함되었는지 판단
function isMealRelatedPrediction(prediction) {
  const className = prediction.className.toLowerCase();

  return MEAL_RELATED_KEYWORDS.some((keyword) => {
    return className.includes(keyword);
  });
}

// 이미지를 받아 식사 상황인지 분류
export async function classifyMealScene(srcElement) {
  if (!srcElement) {
    throw new Error("분류할 이미지 또는 비디오 요소가 없습니다.");
  }

  const model = await loadMobileNetModel();

  // 테스트용, 확률 가장 높은 10개 labels
  const predictions = await model.classify(srcElement, 10);

  console.log("MobileNet predictions:", predictions);

  // 식사 관련 라벨을 포함하고 confidence threshold를 넘는 예측
  const mealRelatedPrediction = predictions.find((prediction) => {
    return (
      prediction.probability >= MEAL_CONFIDENCE_THRESHOLD &&
      isMealRelatedPrediction(prediction)
    );
  });

  return {
    isMealScene: Boolean(mealRelatedPrediction),
    predictions,
    mealRelatedPrediction: mealRelatedPrediction || null,
  };
}
