import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { createConfusionEvent } from "@/features/confusion/api/confusionEventsApi";

import "./ConfusionSelectPage.css";

const CONFUSION_OPTIONS = [
  {
    id: "person",
    label: "사람",
    description: "앞에 있는 사람이 누구인지 헷갈려요.",
  },
  {
    id: "place",
    label: "장소",
    description: "지금 여기가 어디인지 헷갈려요.",
  },
  {
    id: "time",
    label: "시간",
    description: "지금이 몇 시인지, 어떤 때인지 헷갈려요.",
  },
  {
    id: "task",
    label: "해야 할 일",
    description: "지금 무엇을 해야 하는지 모르겠어요.",
  },
  {
    id: "meal",
    label: "식사",
    description: "식사를 했는지, 해야 하는지 헷갈려요.",
  },
];

export default function ConfusionSelectPage() {
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleConfusionSelect = async (confusionType) => {
    if (isSaving) {
      return;
    }

    try {
      setIsSaving(true);
      setMessage("");
      await createConfusionEvent({
        confusionType,
        occurredAt: new Date().toISOString(),
      });
      setMessage("선택한 내용을 기록했어요.");
    } catch (error) {
      setMessage(error.message || "선택한 내용을 기록하지 못했어요.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    navigate("/patient/daily");
  };

  return (
    <main className="confusion-select-page">
      <section className="confusion-select-page__header">
        <p className="confusion-select-page__eyebrow">기억새록</p>
        <h1>무엇이 헷갈리시나요?</h1>
        <p>
          지금 가장 헷갈리는 것을 골라주세요.
          <br />
          천천히 확인해볼게요.
        </p>
      </section>

      <section className="confusion-select-page__options">
        {CONFUSION_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className="confusion-select-page__option"
            disabled={isSaving}
            onClick={() => handleConfusionSelect(option.id)}
          >
            <span className="confusion-select-page__option-label">
              {option.label}
            </span>
          </button>
        ))}
      </section>

      {message && <p role="status">{message}</p>}

      <button
        type="button"
        className="confusion-select-page__back-button"
        onClick={handleBack}
      >
        일상 모드로 돌아가기
      </button>
    </main>
  );
}
