import * as tf from "@tensorflow/tfjs";

const MODEL_BASE_PATH = "/models/meal-scene-classifier";

const MODEL_URL = `${MODEL_BASE_PATH}/model.json`;
const METADATA_URL = `${MODEL_BASE_PATH}/metadata.json`;

const IMAGE_SIZE = 224;
const MEAL_CLASS_NAME = "meal_scene";
const MEAL_SCENE_THRESHOLD = 0.7;

let model = null;
let classLabels = null;

async function loadMetadata() {
  const response = await fetch(METADATA_URL);

  if (!response.ok) {
    throw new Error("Teachable Machine metadata를 불러오지 못했습니다.");
  }

  const metadata = await response.json();

  if (!Array.isArray(metadata.labels)) {
    throw new Error("metadata.json에서 labels를 찾을 수 없습니다.");
  }

  return metadata.labels;
}

async function loadMealSceneModel() {
  if (model && classLabels) {
    return {
      model,
      classLabels,
    };
  }

  await tf.ready();

  model = await tf.loadLayersModel(MODEL_URL);
  classLabels = await loadMetadata();

  console.log("Teachable Machine model loaded");
  console.log("Class labels:", classLabels);

  return {
    model,
    classLabels,
  };
}

function createInputTensor(sourceElement) {
  return tf.tidy(() => {
    const imageTensor = tf.browser.fromPixels(sourceElement);

    const resizedTensor = tf.image.resizeBilinear(imageTensor, [
      IMAGE_SIZE,
      IMAGE_SIZE,
    ]);

    const normalizedTensor = resizedTensor.div(255);

    return normalizedTensor.expandDims(0);
  });
}

function convertPredictionsToResult(predictionValues, labels) {
  return labels.map((label, index) => {
    return {
      className: label,
      probability: predictionValues[index],
    };
  });
}

function findPredictionByClassName(predictions, className) {
  return predictions.find((prediction) => {
    return prediction.className === className;
  });
}

export async function classifyMealScene(sourceElement) {
  if (!sourceElement) {
    throw new Error("분류할 이미지 또는 비디오 요소가 없습니다.");
  }

  const { model: loadedModel, classLabels: loadedClassLabels } =
    await loadMealSceneModel();

  const inputTensor = createInputTensor(sourceElement);
  const outputTensor = loadedModel.predict(inputTensor);

  const predictionValues = await outputTensor.data();

  inputTensor.dispose();
  outputTensor.dispose();

  const predictions = convertPredictionsToResult(
    Array.from(predictionValues),
    loadedClassLabels,
  );

  console.log("Teachable Machine predictions:", predictions);

  const mealScenePrediction = findPredictionByClassName(
    predictions,
    MEAL_CLASS_NAME,
  );

  const mealSceneProbability = mealScenePrediction?.probability ?? 0;

  return {
    isMealScene: mealSceneProbability >= MEAL_SCENE_THRESHOLD,
    predictions,
    mealSceneProbability,
    mealRelatedPrediction: mealScenePrediction || null,
    modelType: "teachable_machine",
  };
}
