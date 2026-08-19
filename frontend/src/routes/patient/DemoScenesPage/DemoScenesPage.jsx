import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchPeople } from "@/features/face-recognition/api/peopleApi";

import "./DemoScenesPage.css";

const DEMO_SCENES = [
  { id: "known-person", group: "인물", title: "등록된 인물", description: "가족으로 등록된 분이에요." },
  { id: "unknown-person", group: "인물", title: "미등록 인물", description: "처음 만나는 분이에요." },
  { id: "meal", group: "식사", title: "식사 장면", description: "식사 중인 모습을 확인해요." },
  { id: "non-meal", group: "식사", title: "비식사 장면", description: "식사와 관계없는 장면이에요." },
];

function createResult(scene, person) {
  if (scene.id === "known-person") {
    const label = person?.relationship
      ? `${person.relationship} ${person.name}님`
      : person?.name || "등록된 가족분";
    return { title: `${label}이에요`, message: "등록된 인물 정보와 추억을 함께 살펴볼 수 있어요.", action: "추억 살펴보기" };
  }
  if (scene.id === "unknown-person") return { title: "등록되지 않은 분이에요", message: "필요하면 이름과 관계를 등록할 수 있어요.", action: "인물 인식으로 확인하기" };
  if (scene.id === "meal") return { title: "식사 중이신가요?", message: "식사 기록을 남기는 흐름을 체험할 수 있어요.", action: "식사 기록 보기" };
  return { title: "식사 장면이 아니에요", message: "다른 예시 장면도 선택해 볼 수 있어요.", action: "다른 장면 선택" };
}

export default function DemoScenesPage() {
  const navigate = useNavigate();
  const [person, setPerson] = useState(null);
  const [selectedScene, setSelectedScene] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetchPeople().then((people) => setPerson(people[0] || null)).catch(() => {});
  }, []);

  const handleSelectScene = (scene) => {
    setSelectedScene(scene);
    setResult(null);
  };

  const handleAnalyze = () => {
    if (!selectedScene || isAnalyzing) return;
    setIsAnalyzing(true);
    window.setTimeout(() => {
      setResult(createResult(selectedScene, person));
      setIsAnalyzing(false);
    }, 700);
  };

  const handleResultAction = () => {
    if (selectedScene?.id === "known-person" && person?.id) {
      navigate(`/patient/memory-album/${person.id}`, { state: { person } });
    } else if (selectedScene?.id === "meal") {
      navigate("/patient/meal-records");
    } else if (selectedScene?.id === "unknown-person") {
      navigate("/patient/daily");
    } else {
      setSelectedScene(null);
      setResult(null);
    }
  };

  return (
    <main className="demo-scenes-page">
      <div className="demo-scenes-page__background" aria-hidden="true" />
      <header className="demo-scenes-page__header">
        <div><p>기억새록 데모</p><h1>예시 장면으로 일상을 살펴보세요</h1></div>
        <button type="button" onClick={() => navigate("/roles")}>돌아가기</button>
      </header>

      <section className="demo-scenes-page__stage" aria-label="예시 장면 선택">
        <p className="demo-scenes-page__guide">준비된 장면을 고른 뒤 인식해 보세요.</p>
        <div className="demo-scenes-page__scene-list">
          {DEMO_SCENES.map((scene) => (
            <button key={scene.id} type="button" className={selectedScene?.id === scene.id ? "is-selected" : ""} onClick={() => handleSelectScene(scene)}>
              <span>{scene.group}</span><strong>{scene.title}</strong><small>{scene.description}</small>
            </button>
          ))}
        </div>
        <button className="demo-scenes-page__analyze-button" type="button" disabled={!selectedScene || isAnalyzing} onClick={handleAnalyze}>
          {isAnalyzing ? "장면을 인식하고 있어요" : selectedScene ? `${selectedScene.title} 인식하기` : "장면을 선택해 주세요"}
        </button>
      </section>

      {result && <section className="demo-scenes-page__result" role="status"><h2>{result.title}</h2><p>{result.message}</p><button type="button" onClick={handleResultAction}>{result.action}</button></section>}
      <button className="demo-scenes-page__camera-action" type="button" onClick={() => navigate("/patient/daily")}>후면 카메라로 직접 체험하기</button>
    </main>
  );
}
