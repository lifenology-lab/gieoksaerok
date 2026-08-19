import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchPeople } from "@/features/face-recognition/api/peopleApi";
import { loadFaceApiModels } from "@/features/face-recognition/hooks/usePersonRecognition";

import "./DemoScenesPage.css";

const FACE_MATCH_THRESHOLD = 0.55;

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
    image: "/demo-scenes/non-meals/non_meal_demo_1.jpg",
    info: "식사와 관계없는 장면을 구분하는 예시예요.",
  },
  {
    id: "non-meal-2",
    type: "non-meal",
    title: "비식사 장면",
    image: "/demo-scenes/non-meals/non_meal_demo_2.jpg",
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

function SceneTile({ scene, selected, onSelect, onShowInfo }) {
  const isPerson = scene.type === "registered" || scene.type === "unknown";

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
            ? scene.type === "registered"
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

function createMealResult(scene) {
  if (scene.type === "meal") {
    return {
      title: "식사 장면으로 보입니다",
      message: "일상 모드에서는 식사 기록을 남기는 카드가 이어서 열려요.",
    };
  }

  return {
    title: "식사 장면이 아니에요",
    message: "다른 예시 장면을 선택해 보세요.",
  };
}

export default function DemoScenesPage() {
  const navigate = useNavigate();
  const [people, setPeople] = useState([]);
  const [selectedScene, setSelectedScene] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [infoScene, setInfoScene] = useState(null);

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
        const { faceBox, matchedPerson } = await analyzePersonScene(
          selectedScene,
          people,
        );
        const displayPerson = matchedPerson || people[0] || null;

        setResult({
          scene: selectedScene,
          faceBox,
          matchedPerson: displayPerson,
          title:
            selectedScene.type === "registered"
              ? displayPerson?.relationship
                ? `${displayPerson.relationship} ${displayPerson.name}님이에요`
                : "등록된 보호자예요"
              : "등록되지 않은 분이에요",
          message:
            selectedScene.type === "registered"
              ? "얼굴을 찾고 등록된 인물 정보를 연결했어요."
              : "데모용 인물 정보를 미리 채워 두었어요.",
        });
      } else {
        setResult({ scene: selectedScene, ...createMealResult(selectedScene) });
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
        <p className="demo-scenes-page__guide">
          사진을 고른 뒤 인식하기를 눌러 보세요.
        </p>

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
                <small>데모에서는 인물 정보를 수정할 수 없어요.</small>
              </div>
            )}

            {result.scene.type !== "unknown" && (
              <button
                className="demo-scenes-page__result-action"
                type="button"
                onClick={handleResultAction}
              >
                {result.scene.type === "registered" ? "추억 카드 보기" : "확인"}
              </button>
            )}
          </article>
        </section>
      )}
    </main>
  );
}
