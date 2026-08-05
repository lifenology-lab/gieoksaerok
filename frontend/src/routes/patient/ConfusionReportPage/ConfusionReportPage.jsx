import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchConfusionEvents } from "@/features/confusion/api/confusionEventsApi";
import {
  addDays,
  createWeeklyConfusionReport,
  formatWeekRange,
  getWeekStart,
} from "@/features/confusion/utils/weeklyConfusionReport";

import "./ConfusionReportPage.css";

const CURRENT_WEEK_START = getWeekStart();

export default function ConfusionReportPage() {
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(CURRENT_WEEK_START);
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadConfusionEvents = async () => {
      try {
        setIsLoading(true);
        setErrorMessage("");
        const nextEvents = await fetchConfusionEvents();

        if (isMounted) {
          setEvents(nextEvents);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error.message || "혼동 기록을 불러오지 못했어요.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadConfusionEvents();

    return () => {
      isMounted = false;
    };
  }, []);

  const report = createWeeklyConfusionReport(events, weekStart);
  const isCurrentWeek = weekStart.getTime() >= CURRENT_WEEK_START.getTime();

  return (
    <main className="confusion-report-page">
      <div className="confusion-report-page__background" aria-hidden="true" />

      <header className="confusion-report-page__header">
        <p>혼동 주간 리포트</p>
        <h1>주간 혼동 기록</h1>
        <span>{formatWeekRange(weekStart)}</span>
      </header>

      <div className="confusion-report-page__week-actions">
        <button
          type="button"
          onClick={() => setWeekStart((currentWeek) => addDays(currentWeek, -7))}
        >
          이전 주
        </button>
        <button
          type="button"
          disabled={isCurrentWeek}
          onClick={() => setWeekStart((currentWeek) => addDays(currentWeek, 7))}
        >
          다음 주
        </button>
      </div>

      <section className="confusion-report-page__summary" aria-live="polite">
        <span>이 주의 기록</span>
        <strong>{report.total}회</strong>
        <p>
          {report.total > 0
            ? "기록된 혼동 영역을 확인해보세요."
            : "이 기간에는 기록된 혼동이 없어요."}
        </p>
      </section>

      <section
        className="confusion-report-page__breakdown"
        aria-busy={isLoading}
        aria-label="영역별 혼동 횟수"
      >
        {isLoading && <p className="confusion-report-page__state">불러오는 중이에요.</p>}
        {!isLoading && errorMessage && (
          <p className="confusion-report-page__state is-error">{errorMessage}</p>
        )}
        {!isLoading && !errorMessage && (
          <ul>
            {report.items.map((item) => {
              const barWidth =
                report.maximum === 0 ? 0 : (item.count / report.maximum) * 100;

              return (
                <li key={item.id}>
                  <div>
                    <span>{item.label}</span>
                    <strong>{item.count}회</strong>
                  </div>
                  <span className="confusion-report-page__bar" aria-hidden="true">
                    <span style={{ width: `${barWidth}%` }} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="confusion-report-page__navigation-actions">
        <button
          type="button"
          className="confusion-report-page__back-button"
          onClick={() => navigate("/patient/confusion")}
        >
          혼동 선택으로 돌아가기
        </button>
        <button
          type="button"
          className="confusion-report-page__back-button"
          onClick={() => navigate("/patient")}
        >
          홈으로 돌아가기
        </button>
      </section>
    </main>
  );
}
