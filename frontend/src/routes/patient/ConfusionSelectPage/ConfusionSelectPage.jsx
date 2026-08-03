import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import "./ConfusionSelectPage.css";

const WEEKDAY_LABELS = [
  "일요일",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일",
];

function formatDate(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAY_LABELS[date.getDay()]})`;
}

function formatTime(date) {
  const hours = date.getHours();
  const period = hours < 12 ? "오전" : "오후";
  const displayHours = hours % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${period} ${String(displayHours).padStart(2, "0")}:${minutes}`;
}

function PersonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 12.2a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Z" />
      <path d="M4.8 20.2c1.1-3.7 3.6-5.6 7.2-5.6s6.1 1.9 7.2 5.6" />
    </svg>
  );
}

function PlaceIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 21s6-5.8 6-11a6 6 0 0 0-12 0c0 5.2 6 11 6 11Z" />
      <path d="M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z" />
    </svg>
  );
}

function TimeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
      <path d="M12 7.5V12l3.2 2" />
    </svg>
  );
}

function TaskIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M6.5 5.2h11A1.8 1.8 0 0 1 19.3 7v11.1a1.8 1.8 0 0 1-1.8 1.8h-11a1.8 1.8 0 0 1-1.8-1.8V7a1.8 1.8 0 0 1 1.8-1.8Z" />
      <path d="m8.2 12 2.1 2.1 5.5-5.5" />
    </svg>
  );
}

function MealIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 3.8v7" />
      <path d="M4.7 3.8v4.6A2.3 2.3 0 0 0 7 10.7a2.3 2.3 0 0 0 2.3-2.3V3.8" />
      <path d="M7 10.8v9.4" />
      <path d="M16.8 4.3v15.9" />
      <path d="M16.8 4.3c1.7 1.1 2.5 2.7 2.5 4.8 0 2.1-.8 3.7-2.5 4.8" />
    </svg>
  );
}

const CONFUSION_ICONS = {
  person: <PersonIcon />,
  place: <PlaceIcon />,
  time: <TimeIcon />,
  task: <TaskIcon />,
  meal: <MealIcon />,
};

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

const MOCK_PATIENT_ID = "mock-patient-1";

export default function ConfusionSelectPage() {
  const navigate = useNavigate();
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  const [selectedConfusionType, setSelectedConfusionType] = useState("");

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentDateTime(new Date());
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const handleConfusionSelect = (confusionType) => {
    setSelectedConfusionType(confusionType);

    const payload = {
      patient_id: MOCK_PATIENT_ID,
      confusion_type: confusionType,
      occurred_at: new Date().toISOString(),
    };

    console.log("ConfusionEvent payload:", payload);
  };

  const handleBack = () => {
    navigate("/patient/daily");
  };

  return (
    <main className="confusion-select-page">
      <div className="confusion-select-page__background" aria-hidden="true" />

      <section className="confusion-select-page__date-time" aria-live="polite">
        <p>{formatDate(currentDateTime)}</p>
        <strong>{formatTime(currentDateTime)}</strong>
        <span aria-hidden="true" />
      </section>

      <button
        type="button"
        className="confusion-select-page__back-button"
        onClick={handleBack}
      >
        돌아가기
      </button>

      <section className="confusion-select-page__intro">
        <span aria-hidden="true" />
        <div>
          <h1>무엇이 헷갈리시나요?</h1>
          <p>가장 가까운 것을 골라주세요.</p>
        </div>
      </section>

      <section className="confusion-select-page__options">
        {CONFUSION_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className="confusion-select-page__option"
            data-selected={selectedConfusionType === option.id}
            onClick={() => handleConfusionSelect(option.id)}
          >
            <span className="confusion-select-page__option-icon">
              {CONFUSION_ICONS[option.id]}
            </span>
            <span className="confusion-select-page__option-label">
              {option.label}
            </span>
            <span className="confusion-select-page__option-description">
              {option.description}
            </span>
          </button>
        ))}
      </section>
    </main>
  );
}
