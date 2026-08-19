import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { createPerson, fetchPeople } from "@/features/face-recognition/api/peopleApi";
import { loadFaceApiModels } from "@/features/face-recognition/hooks/usePersonRecognition";
import { createMealRecord } from "@/features/meal-recognition/api/mealRecognitionApi";
import { classifyMealScene } from "@/features/meal-recognition/model/teachableMachineMealClassifier";
import { getSuggestedMealType } from "@/features/meal-recognition/utils/mealRecordUtils";

import "./DemoScenesPage.css";

const FACE_MATCH_THRESHOLD = 0.55;

const DEMO_ASSET_INFO = {
  title: "예시 이미지 안내",
  info:
    "인물 예시 이미지: AI로 생성한 가상 인물 이미지입니다.\n식사 예시 이미지: 직접 촬영한 식사 사진입니다.\n비식사 예시 이미지: Pixabay의 로열티 프리 이미지를 사용했습니다.",
};

const DEMO_PERSON_SCENES = [
  {
    id: "registered-caregiver-1",
    type: "registered",
    title: "등록된 보호자",
    description: "등록된 보호자의 첫 번째 사진이에요.",
    image: "/demo-scenes/people/registered/caregiver_demo_1.png",
    info: "같은 보호자를 다른 사진에서도 알아보는 예시예요.",
  },
  {
    id: "registered-caregiver-2",
    type: "registered",
    title: "등록된 보호자",
    description: "다른 모습에서도 같은 분을 확인해요.",
    image: "/demo-scenes/people/registered/caregiver_demo_2.png",
    info: "등록된 인물은 얼굴 인식 뒤 추억 카드와 연결돼요.",
  },
  {
    id: "unknown-grandchild",
    type: "unknown",
    title: "미등록 인물",
    description: "보호자의 아들로 설정된 예시 인물이에요.",
    image: "/demo-scenes/people/unknown/grandchild_demo_1.png",
    info: "김태윤, 17세예요. 보호자인 딸 지민 씨의 아들이에요.",
    demoProfile: { name: "김태윤", age: "17세", relationship: "외손자" },
  },
  {
    id: "unknown-neighbor",
    type: "unknown",
    title: "미등록 인물",
    description: "가까운 이웃으로 설정된 예시 인물이에요.",
    image: "/demo-scenes/people/unknown/neighbor_demo_1.png",
    info: "김미진, 63세예요. 같은 아파트에 사는 가까운 이웃이에요.",
    demoProfile: { name: "김미진", age: "63세", relationship: "친한 이웃" },
  },
];

const DEMO_MEAL_SCENES = [
  {
    id: "meal-1",
    type: "meal",
    title: "식사 장면",
    image: "/demo-scenes/meals/meal_demo_1.jpg",
    info: "식탁과 음식이 보이는 식사 예시 장면이에요.",
  },
  {
    id: "meal-2",
    type: "meal",
    title: "식사 장면",
    image: "/demo-scenes/meals/meal_demo_2.jpg",
    info: "다른 식사 장면도 같은 흐름으로 체험할 수 있어요.",
  },
  {
    id: "non-meal-1",
    type: "non-meal",
    title: "비식사 장면",
    image: "/demo-scenes/non-meals/non-meal_demo_1.jpg",
    info: "식사와 관계없는 장면을 구분하는 예시예요.",
  },
  {
    id: "non-meal-2",
    type: "non-meal",
    title: "비식사 장면",
    image: "/demo-scenes/non-meals/non-meal_demo_2.jpg",
    info: "다른 비식사 장면도 추가할 수 있어요.",
  },
];

function findKnownPerson(faceapi, descriptor, people) {
  let bestMatch = null;

  people.forEach((person) => {
    if (!Array.isArray(person.face_descriptor)) {
      return;
    }

    const distance = faceapi.euclideanDistance(
      descriptor,
      person.face_descriptor,
    );

    if (!bestMatch || distance < bestMatch.distance) {
      bestMatch = { person, distance };
    }
  });

  return bestMatch?.distance <= FACE_MATCH_THRESHOLD ? bestMatch.person : null;
}

function toFaceBoxPercent(box, image) {
  return {
    left: `${(box.x / image.width) * 100}%`,
    top: `${(box.y / image.height) * 100}%`,
    width: `${(box.width / image.width) * 100}%`,
    height: `${(box.height / image.height) * 100}%`,
  };
}

async function analyzePersonScene(scene, people) {
  const faceapi = await loadFaceApiModels();
  const image = await faceapi.fetchImage(scene.image);
  const detection = await faceapi
    .detectSingleFace(
      image,
      new faceapi.TinyFaceDetectorOptions({
        inputSize: 320,
        scoreThreshold: 0.5,
      }),
    )
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    throw new Error("사진에서 얼굴을 찾지 못했어요.");
  }

  const matchedPerson = findKnownPerson(
    faceapi,
    Array.from(detection.descriptor),
    people,
  );

  return {
    faceBox: toFaceBoxPercent(detection.detection.box, image),
    faceDescriptor: Array.from(detection.descriptor),
    matchedPerson,
  };
}

function DemoSceneImage({ scene }) {
  const [hasImageError, setHasImageError] = useState(false);

  if (hasImageError) {
    return (
      <span className="demo-scenes-page__image-placeholder">사진 준비 중</span>
    );
  }

  return (
    <img
      src={scene.image}
      alt={`${scene.title} 예시 사진`}
      onError={() => setHasImageError(true)}
    />
  );
}

function SceneTile({ scene, selected, isDemoRegistered, onSelect, onShowInfo }) {
  const isPerson = scene.type === "registered" || scene.type === "unknown";
  const isRegisteredPerson = scene.type === "registered" || isDemoRegistered;

  return (
    <article
      className={`demo-scenes-page__scene-tile ${selected ? "is-selected" : ""}`}
    >
      <button
        className="demo-scenes-page__scene-select"
        type="button"
        onClick={() => onSelect(scene)}
      >
        <DemoSceneImage scene={scene} />
        <span className="demo-scenes-page__scene-kind">
          {isPerson
            ? isRegisteredPerson
              ? "등록 인물"
              : "미등록 인물"
            : scene.type === "meal"
              ? "식사"
              : "비식사"}
        </span>
      </button>
      <button
        className="demo-scenes-page__scene-info"
        type="button"
        aria-label={`${scene.title} 설명 보기`}
        onClick={(event) => {
          event.stopPropagation();
          onShowInfo(scene);
        }}
      >
        i
      </button>
    </article>
  );
}

function loadDemoImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("예시 이미지를 불러오지 못했어요."));
    image.src = source;
  });
}

async function analyzeMealScene(scene) {
  const image = await loadDemoImage(scene.image);

  return classifyMealScene(image);
}

async function createDemoSceneImageFile(scene) {
  const response = await fetch(scene.image);

  if (!response.ok) {
    throw new Error("식사 사진을 준비하지 못했어요.");
  }

  const imageBlob = await response.blob();

  return new File([imageBlob], `${scene.id}.jpg`, {
    type: imageBlob.type || "image/jpeg",
  });
}

function createMealResult(scene, mealSceneResult) {
  const confidence = Math.round(mealSceneResult.mealSceneProbability * 100);

  if (mealSceneResult.isMealScene) {
    return {
      title: "식사 장면으로 인식했어요",
      message: `식사 장면일 가능성이 ${confidence}%예요. 일상 모드에서는 식사 기록을 남기는 카드가 이어서 열려요.`,
      isMealScene: true,
    };
  }

  return {
    title: "식사 장면이 아니에요",
    message: `식사 장면일 가능성이 ${confidence}%예요. 다른 예시 장면을 선택해 보세요.`,
    isMealScene: false,
  };
}

export default function DemoScenesPage() {
  const navigate = useNavigate();
  const [people, setPeople] = useState([]);
  const [selectedScene, setSelectedScene] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isMealRecordSaving, setIsMealRecordSaving] = useState(false);
  const [isPersonSaving, setIsPersonSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [infoScene, setInfoScene] = useState(null);
  const [registeredDemoPeople, setRegisteredDemoPeople] = useState({});

  useEffect(() => {
    fetchPeople()
      .then(setPeople)
      .catch(() => setPeople([]));
  }, []);

  const handleSelectScene = (scene) => {
    setSelectedScene((currentScene) =>
      currentScene?.id === scene.id ? null : scene,
    );
    setResult(null);
  };

  const handleAnalyze = async () => {
    if (!selectedScene || isAnalyzing) {
      return;
    }

    setIsAnalyzing(true);

    try {
      if (
        selectedScene.type === "registered" ||
        selectedScene.type === "unknown"
      ) {
        const { faceBox, faceDescriptor, matchedPerson } = await analyzePersonScene(
          selectedScene,
          people,
        );
        const registeredDemoPerson = registeredDemoPeople[selectedScene.id] || null;
        const isRegisteredPerson =
          selectedScene.type === "registered" || Boolean(registeredDemoPerson);
        const displayPerson =
          matchedPerson ||
          registeredDemoPerson ||
          (selectedScene.type === "registered" ? people[0] || null : null);

        setResult({
          scene: selectedScene,
          faceBox,
          faceDescriptor,
          matchedPerson: displayPerson,
          isDemoRegistered: isRegisteredPerson && selectedScene.type === "unknown",
          canRegisterDemoPerson:
            !isRegisteredPerson && selectedScene.type === "unknown",
          title:
            isRegisteredPerson
              ? displayPerson?.relationship
                ? `${displayPerson.relationship} ${displayPerson.name}님이에요`
                : "등록된 보호자예요"
              : "등록되지 않은 분이에요",
          message:
            isRegisteredPerson
              ? "얼굴을 찾고 등록된 인물 정보를 연결했어요."
              : "데모용 인물 정보를 미리 채워 두었어요.",
        });
      } else {
        const mealSceneResult = await analyzeMealScene(selectedScene);

        setResult({
          scene: selectedScene,
          ...createMealResult(selectedScene, mealSceneResult),
        });
      }
    } catch (error) {
      setResult({
        scene: selectedScene,
        title: "인식을 완료하지 못했어요",
        message: error?.message || "사진을 다시 확인해 주세요.",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleResultAction = () => {
    if (result?.canRegisterDemoPerson) {
      const registerDemoPerson = async () => {
        try {
          setIsPersonSaving(true);

          const createdPerson = await createPerson({
            name: result.scene.demoProfile.name,
            relationship: result.scene.demoProfile.relationship,
            faceDescriptor: result.faceDescriptor,
          });

          setPeople((currentPeople) => [...currentPeople, createdPerson]);
          setRegisteredDemoPeople((currentPeople) => ({
            ...currentPeople,
            [result.scene.id]: createdPerson,
          }));
          setResult((currentResult) => ({
            ...currentResult,
            matchedPerson: createdPerson,
            isDemoRegistered: true,
            canRegisterDemoPerson: false,
            title: `${createdPerson.relationship} ${createdPerson.name}님을 등록했어요`,
            message: "다음 인식부터는 등록된 인물 정보로 안내할게요.",
          }));
        } catch (error) {
          setResult((currentResult) => ({
            ...currentResult,
            message:
              error?.message || "인물 정보를 등록하지 못했어요. 다시 시도해 주세요.",
          }));
        } finally {
          setIsPersonSaving(false);
        }
      };

      registerDemoPerson();
      return;
    }

    if (result?.mealRecordCreated) {
      navigate("/patient/meal-records");
      return;
    }

    if (result?.scene?.type === "meal" && result.isMealScene) {
      const saveDemoMealRecord = async () => {
        try {
          setIsMealRecordSaving(true);

          const eatenAt = new Date().toISOString();
          const sceneImage = await createDemoSceneImageFile(result.scene);
          const createdMealRecord = await createMealRecord({
            mealType: getSuggestedMealType(eatenAt),
            eatenAt,
            source: "patient_confirmed",
            sceneImage,
          });

          setResult((currentResult) => ({
            ...currentResult,
            title: "식사 기록이 완료되었어요",
            message: `${createdMealRecord.mealLabel} 식사 기록과 사진을 함께 남겼어요.`,
            isMealScene: false,
            mealRecordCreated: true,
          }));
        } catch (error) {
          setResult((currentResult) => ({
            ...currentResult,
            message:
              error?.message || "식사 기록을 저장하지 못했어요. 다시 시도해 주세요.",
          }));
        } finally {
          setIsMealRecordSaving(false);
        }
      };

      saveDemoMealRecord();
      return;
    }

    if (result?.scene?.type === "registered" && result.matchedPerson?.id) {
      navigate(`/patient/memory-album/${result.matchedPerson.id}`, {
        state: { person: result.matchedPerson },
      });
      return;
    }

    setResult(null);
  };

  return (
    <main className="demo-scenes-page">
      <div className="demo-scenes-page__background" aria-hidden="true" />

      <header className="demo-scenes-page__header">
        <div>
          <p>기억새록 데모</p>
          <h1>예시 장면으로 일상을 살펴보세요</h1>
        </div>
        <button
          className="page-back-button"
          type="button"
          onClick={() => navigate("/patient")}
        >
          돌아가기
        </button>
      </header>

      <section className="demo-scenes-page__stage" aria-label="예시 장면 선택">
        <div className="demo-scenes-page__guide-row">
          <p className="demo-scenes-page__guide">
            사진을 고른 뒤 인식하기를 눌러 보세요.
          </p>
          <button
            className="demo-scenes-page__asset-info-button"
            type="button"
            onClick={() => setInfoScene(DEMO_ASSET_INFO)}
          >
            이미지 안내
          </button>
        </div>

        <div className="demo-scenes-page__scene-groups">
          <section
            className="demo-scenes-page__scene-group"
            aria-labelledby="demo-person-title"
          >
            <h2 id="demo-person-title">인물 예시 이미지</h2>
            <div className="demo-scenes-page__scene-grid">
              {DEMO_PERSON_SCENES.map((scene) => (
                <SceneTile
                  key={scene.id}
                  scene={scene}
                  selected={selectedScene?.id === scene.id}
                  isDemoRegistered={Boolean(registeredDemoPeople[scene.id])}
                  onSelect={handleSelectScene}
                  onShowInfo={setInfoScene}
                />
              ))}
            </div>
          </section>

          <section
            className="demo-scenes-page__scene-group"
            aria-labelledby="demo-meal-title"
          >
            <h2 id="demo-meal-title">식사 예시 이미지</h2>
            <div className="demo-scenes-page__scene-grid">
              {DEMO_MEAL_SCENES.map((scene) => (
                <SceneTile
                  key={scene.id}
                  scene={scene}
                  selected={selectedScene?.id === scene.id}
                  isDemoRegistered={false}
                  onSelect={handleSelectScene}
                  onShowInfo={setInfoScene}
                />
              ))}
            </div>
          </section>
        </div>

        <button
          className="demo-scenes-page__analyze-button"
          type="button"
          disabled={!selectedScene || isAnalyzing}
          onClick={handleAnalyze}
        >
          {isAnalyzing
            ? selectedScene?.type === "registered" ||
              selectedScene?.type === "unknown"
              ? "인물을 인식하고 있어요"
              : "식사 장면을 인식하고 있어요"
            : selectedScene
              ? "선택한 장면 인식하기"
              : "장면을 선택해 주세요"}
        </button>

        <button
          className="demo-scenes-page__camera-action"
          type="button"
          onClick={() => navigate("/patient/daily")}
        >
          후면 카메라로 직접 체험하기
        </button>
      </section>

      {infoScene && (
        <section
          className="demo-scenes-page__dialog-backdrop"
          role="presentation"
        >
          <article
            className="demo-scenes-page__info-dialog"
            role="dialog"
            aria-modal="true"
          >
            <h2>{infoScene.title}</h2>
            <p>{infoScene.info}</p>
            <button type="button" onClick={() => setInfoScene(null)}>
              닫기
            </button>
          </article>
        </section>
      )}

      {result && (
        <section
          className="demo-scenes-page__dialog-backdrop"
          role="presentation"
        >
          <article
            className="demo-scenes-page__result-dialog"
            role="dialog"
            aria-modal="true"
          >
            {result.scene.image && (
              <div className="demo-scenes-page__result-image">
                <img src={result.scene.image} alt="선택한 예시 장면" />
                {result.faceBox && (
                  <span
                    className="demo-scenes-page__face-box"
                    style={result.faceBox}
                  />
                )}
                <button
                  className="demo-scenes-page__dialog-close"
                  type="button"
                  onClick={() => setResult(null)}
                >
                  닫기
                </button>
              </div>
            )}
            <h2>{result.title}</h2>
            <p>{result.message}</p>

            {result.scene.type === "unknown" && result.scene.demoProfile && (
              <div className="demo-scenes-page__demo-profile">
                <label>
                  이름
                  <input value={result.scene.demoProfile.name} disabled />
                </label>
                <label>
                  나이
                  <input value={result.scene.demoProfile.age} disabled />
                </label>
                <label>
                  관계
                  <input
                    value={result.scene.demoProfile.relationship}
                    disabled
                  />
                </label>
                <small>
                  {result.isDemoRegistered
                    ? "등록된 인물 정보예요."
                    : "데모에서는 인물 정보를 수정할 수 없어요."}
                </small>
              </div>
            )}

            {(result.scene.type !== "unknown" ||
              result.isDemoRegistered ||
              result.canRegisterDemoPerson) && (
              <button
                className="demo-scenes-page__result-action"
                type="button"
                onClick={handleResultAction}
                disabled={isMealRecordSaving || isPersonSaving}
              >
                {result.canRegisterDemoPerson
                  ? isPersonSaving
                    ? "인물 정보를 등록하고 있어요"
                    : "등록하고 다시 인식하기"
                  : result.scene.type === "registered"
                  ? "추억 카드 보기"
                  : result.mealRecordCreated
                    ? "식사 기록 보기"
                    : result.isMealScene
                      ? isMealRecordSaving
                        ? "식사 기록을 남기고 있어요"
                        : "식사 기록으로 남기기"
                      : "확인"}
              </button>
            )}
          </article>
        </section>
      )}
    </main>
  );
}
