import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchMealRecords } from "@/features/meal-recognition/api/mealRecognitionApi";

import "./MealRecordsPage.css";

function formatEatenAt(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "기록 시간 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  }).format(date);
}

export default function MealRecordsPage() {
  const navigate = useNavigate();
  const [mealRecords, setMealRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadMealRecords = async () => {
      try {
        setIsLoading(true);
        setErrorMessage("");
        const nextMealRecords = await fetchMealRecords();

        if (isMounted) {
          setMealRecords(nextMealRecords);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error.message || "식사 기록을 불러오지 못했어요.");
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

      <header className="meal-records-page__header">
        <p>식사 기록</p>
        <h1>최근 식사를 확인해볼까요?</h1>
        <span>기록을 천천히 함께 살펴보세요.</span>
      </header>

      <section className="meal-records-page__list" aria-busy={isLoading}>
        {isLoading && <p className="meal-records-page__state">불러오는 중이에요.</p>}
        {!isLoading && errorMessage && (
          <p className="meal-records-page__state is-error">{errorMessage}</p>
        )}
        {!isLoading && !errorMessage && mealRecords.length === 0 && (
          <p className="meal-records-page__state">아직 식사 기록이 없어요.</p>
        )}
        {!isLoading && !errorMessage && mealRecords.length > 0 && (
          <ul>
            {mealRecords.map((mealRecord) => (
              <li key={mealRecord.id}>
                <div>
                  <strong>{mealRecord.mealLabel}</strong>
                  <span>{formatEatenAt(mealRecord.eatenAt)}</span>
                </div>
                {mealRecord.menu && <p>{mealRecord.menu}</p>}
                {mealRecord.memo && <small>{mealRecord.memo}</small>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="meal-records-page__actions">
        <button type="button" onClick={() => navigate("/patient/confusion")}>
          혼동 선택으로 돌아가기
        </button>
        <button type="button" onClick={() => navigate("/patient")}>
          홈으로 돌아가기
        </button>
      </section>
    </main>
  );
}
