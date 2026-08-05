import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { createConfusionEvent } from "@/features/confusion/api/confusionEventsApi";
import {
  DAILY_MODE_RECOGNITION_TYPES,
  DAILY_MODE_RETURN_RECOGNITION_KEY,
} from "@/features/daily-mode/constants/returnRecognition";

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

const CONFUSION_OPTIONS = [
  {
    id: "person",
    label: "사람",
    description: "앞에 있는 사람이 누구인지 헷갈려요.",
    icon: <PersonIcon />,
  },
  {
    id: "place",
    label: "장소",
    description: "지금 여기가 어디인지 헷갈려요.",
    icon: <PlaceIcon />,
  },
  {
    id: "time",
    label: "시간",
    description: "지금이 몇 시인지, 어떤 때인지 헷갈려요.",
    icon: <TimeIcon />,
  },
  {
    id: "task",
    label: "해야 할 일",
    description: "지금 무엇을 해야 하는지 모르겠어요.",
    icon: <TaskIcon />,
  },
  {
    id: "meal",
    label: "식사",
    description: "식사를 했는지, 해야 하는지 헷갈려요.",
    icon: <MealIcon />,
  },
];

const CONFUSION_RESPONSES = {
  person: {
    title: "앞에 계신 분을 다시 확인해볼까요?",
    message: "카메라로 사람을 인식해 이름과 기억을 함께 살펴볼 수 있어요.",
    suggestion: "천천히 화면을 보며 확인해도 괜찮아요.",
    primaryActionLabel: "사람 확인하기",
    action: "person-recognition",
  },
  place: {
    title: "지금 있는 곳을 함께 살펴볼까요?",
    message: "주변의 익숙한 물건이나 표지판을 천천히 확인해보세요.",
    suggestion: "필요하면 보호자에게 지금 있는 곳을 물어봐도 괜찮아요.",
    primaryActionLabel: "일상 모드로 돌아가기",
    action: "daily-mode",
  },
  time: {
    title: "오늘의 시간과 날짜를 확인해볼까요?",
    suggestion: "함께 천천히 살펴 보아요.",
    primaryActionLabel: "확인했어요",
    action: "close",
  },
  task: {
    title: "지금 해야 할 일을 하나씩 확인해볼까요?",
    message:
      "급하게 생각하지 말고, 가장 가까운 보호자에게 오늘의 일을 물어보세요.",
    suggestion: "한 번에 하나씩 확인하면 돼요.",
    primaryActionLabel: "홈으로 돌아가기",
    action: "home",
  },
  meal: {
    title: "최근 식사 기록을 확인해볼까요?",
    message:
      "최근에 남긴 식사 기록을 함께 확인할 수 있어요.",
    suggestion: "식사를 했는지 잘 모르겠다면 기록을 함께 확인해보세요.",
    primaryActionLabel: "식사 기록 확인하기",
    action: "meal-records",
  },
};

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

function formatTimeSupportDate(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAY_LABELS[date.getDay()]}이에요.`;
}

function formatTimeSupportTime(date) {
  const hours = date.getHours();
  const period = hours < 12 ? "오전" : "오후";
  const displayHours = hours % 12 || 12;

  return `${period} ${displayHours}시 ${date.getMinutes()}분이에요.`;
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

export default function ConfusionSelectPage() {
  const navigate = useNavigate();
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  const [selectedConfusionType, setSelectedConfusionType] = useState("");
  const [responseType, setResponseType] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentDateTime(new Date());
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const handleConfusionSelect = async (confusionType) => {
    if (isSaving) {
      return;
    }

    setSelectedConfusionType(confusionType);
    setMessage("");

    try {
      setIsSaving(true);
      await createConfusionEvent({
        confusionType,
        occurredAt: new Date().toISOString(),
      });
      setMessage("선택한 내용을 기록했어요.");
      setResponseType(confusionType);
    } catch (error) {
      setMessage(error.message || "선택한 내용을 기록하지 못했어요.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    navigate("/patient/daily");
  };

  const handleGoReport = () => {
    navigate("/patient/confusion/report");
  };

  const handleResponsePrimaryAction = () => {
    const response = CONFUSION_RESPONSES[responseType];

    if (!response) {
      return;
    }

    if (response.action === "person-recognition") {
      window.sessionStorage.setItem(
        DAILY_MODE_RETURN_RECOGNITION_KEY,
        DAILY_MODE_RECOGNITION_TYPES.PERSON,
      );
      navigate("/patient/daily");
      return;
    }

    if (response.action === "meal-records") {
      navigate("/patient/meal-records");
      return;
    }

    if (response.action === "daily-mode") {
      navigate("/patient/daily");
      return;
    }

    if (response.action === "home") {
      navigate("/patient");
      return;
    }

    setResponseType("");
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
            disabled={isSaving}
            data-selected={selectedConfusionType === option.id}
            onClick={() => handleConfusionSelect(option.id)}
          >
            <span className="confusion-select-page__option-icon">
              {option.icon}
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

      {message && (
        <p className="confusion-select-page__status" role="status">
          {message}
        </p>
      )}

      <button
        type="button"
        className="confusion-select-page__report-button"
        onClick={handleGoReport}
      >
        주간 리포트 보기
      </button>

      {responseType && (
        <section
          className="confusion-response-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confusion-response-title"
        >
          <article className="confusion-response-card">
            <h2 id="confusion-response-title">
              {CONFUSION_RESPONSES[responseType].title}
            </h2>
            {responseType === "time" ? (
              <div className="confusion-response-card__time-information">
                <span>오늘은</span>
                <strong>{formatTimeSupportDate(currentDateTime)}</strong>
                <span>지금은</span>
                <strong>{formatTimeSupportTime(currentDateTime)}</strong>
              </div>
            ) : (
              <p>{CONFUSION_RESPONSES[responseType].message}</p>
            )}
            <p className="confusion-response-card__suggestion">
              {CONFUSION_RESPONSES[responseType].suggestion}
            </p>
            <div className="confusion-response-card__actions">
              <button type="button" onClick={handleResponsePrimaryAction}>
                {CONFUSION_RESPONSES[responseType].primaryActionLabel}
              </button>
              <button type="button" onClick={() => setResponseType("")}>
                다른 도움 보기
              </button>
            </div>
          </article>
        </section>
      )}
    </main>
  );
}
