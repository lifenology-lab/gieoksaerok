import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchMealRecords } from "@/features/meal-recognition/api/mealRecognitionApi";

import "./MealRecordsPage.css";

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

function formatMealDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "기록 시간 정보 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function MealRecordsPage() {
  const navigate = useNavigate();
  const [mealRecords, setMealRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentDateTime(new Date());
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadMealRecords = async () => {
      try {
        const records = await fetchMealRecords();

        if (isMounted) {
          setMealRecords(records);
        }
      } catch {
        if (isMounted) {
          setErrorMessage(
            "식사 기록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadMealRecords();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="meal-records-page">
      <div className="meal-records-page__background" aria-hidden="true" />

      <section className="meal-records-page__date-time" aria-live="polite">
        <p>{formatDate(currentDateTime)}</p>
        <strong>{formatTime(currentDateTime)}</strong>
        <span aria-hidden="true" />
      </section>

      <section className="meal-records-page__intro">
        <span aria-hidden="true" />
        <div>
          <h1>식사 기록</h1>
          <p>남긴 식사를 함께 확인해볼까요?</p>
        </div>
      </section>

      <section className="meal-records-page__content" aria-live="polite">
        {isLoading && (
          <p className="meal-records-page__notice">기록을 불러오고 있어요.</p>
        )}

        {!isLoading && errorMessage && (
          <p className="meal-records-page__notice is-error">{errorMessage}</p>
        )}

        {!isLoading && !errorMessage && mealRecords.length === 0 && (
          <p className="meal-records-page__notice">
            아직 남긴 식사 기록이 없어요.
          </p>
        )}

        {!isLoading && !errorMessage && mealRecords.length > 0 && (
          <ul className="meal-records-page__list">
            {mealRecords.map((mealRecord) => (
              <li key={mealRecord.id}>
                <strong>{mealRecord.mealLabel}</strong>
                <time dateTime={mealRecord.eatenAt}>
                  {formatMealDateTime(mealRecord.eatenAt)}
                </time>
                {mealRecord.menu && <p>{mealRecord.menu}</p>}
                {mealRecord.memo && <p>{mealRecord.memo}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className="meal-records-page__navigation" aria-label="페이지 이동">
        <button type="button" onClick={() => navigate("/patient/daily")}>
          일상 모드로 돌아가기
        </button>
        <button type="button" onClick={() => navigate("/patient")}>
          홈으로 돌아가기
        </button>
      </nav>
    </main>
  );
}
