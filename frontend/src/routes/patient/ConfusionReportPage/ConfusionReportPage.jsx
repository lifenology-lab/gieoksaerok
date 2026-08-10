import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { fetchConfusionEvents } from "@/features/confusion/api/confusionEventsApi";
import {
  addDays,
  createWeeklyConfusionReport,
  formatWeekRange,
  getWeekStart,
} from "@/features/confusion/utils/weeklyConfusionReport";

import "./ConfusionReportPage.css";

const CURRENT_WEEK_START = getWeekStart();
const DETAIL_TABS = [
  { id: "area", label: "영역별" },
  { id: "daily", label: "일자별" },
  { id: "time", label: "시간대별" },
];

function getWeekComparisonMessage(currentTotal, previousTotal) {
  const difference = currentTotal - previousTotal;

  if (difference === 0) {
    return `직전 주와 같은 ${currentTotal}회예요.`;
  }

  if (difference > 0) {
    return `직전 주보다 ${difference}회 늘었어요.`;
  }

  return `직전 주보다 ${Math.abs(difference)}회 줄었어요.`;
}

export default function ConfusionReportPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [weekStart, setWeekStart] = useState(CURRENT_WEEK_START);
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeDetailTab, setActiveDetailTab] = useState("area");

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
  const previousReport = createWeeklyConfusionReport(
    events,
    addDays(weekStart, -7),
  );
  const isCurrentWeek = weekStart.getTime() >= CURRENT_WEEK_START.getTime();
  const topAreaLabel = report.topItems.map((item) => item.label).join(", ");
  const isCaregiverRoute = location.pathname.startsWith("/caregiver");

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
            ? `가장 많이 발생한 영역은 ${topAreaLabel}이며, ${report.maximum}회 기록됐어요. ${getWeekComparisonMessage(report.total, previousReport.total)}`
            : "이 기간에는 기록된 혼동이 없어요."}
        </p>
      </section>

      <section className="confusion-report-page__details" aria-busy={isLoading}>
        {isLoading && <p className="confusion-report-page__state">불러오는 중이에요.</p>}
        {!isLoading && errorMessage && (
          <p className="confusion-report-page__state is-error">{errorMessage}</p>
        )}
        {!isLoading && !errorMessage && (
          <>
            <div className="confusion-report-page__detail-tabs" role="tablist">
              {DETAIL_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeDetailTab === tab.id}
                  className={activeDetailTab === tab.id ? "is-active" : ""}
                  onClick={() => setActiveDetailTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <article className="confusion-report-page__detail-panel">
              {activeDetailTab === "area" && (
                <>
                  <h2>영역별 발생 횟수</h2>
                  <ul className="confusion-report-page__area-list">
                    {report.items.map((item) => {
                      const barWidth =
                        report.maximum === 0
                          ? 0
                          : (item.count / report.maximum) * 100;

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
                </>
              )}

              {activeDetailTab === "daily" && (
                <>
                  <h2>일자별 추이</h2>
                  <div className="confusion-report-page__daily-chart" aria-label="일자별 혼동 횟수">
                    {report.daily.map((item) => {
                      const barHeight =
                        report.maximumDaily === 0
                          ? 0
                          : (item.count / report.maximumDaily) * 100;

                      return (
                        <div key={item.id}>
                          <strong>{item.count}</strong>
                          <span className="confusion-report-page__daily-bar" aria-hidden="true">
                            <span style={{ height: `${barHeight}%` }} />
                          </span>
                          <span>{item.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {activeDetailTab === "time" && (
                <>
                  <h2>시간대별 발생</h2>
                  <ul className="confusion-report-page__time-periods">
                    {report.timePeriods.map((item) => {
                      const barWidth =
                        report.maximumTimePeriod === 0
                          ? 0
                          : (item.count / report.maximumTimePeriod) * 100;

                      return (
                        <li key={item.id}>
                          <div>
                            <span>{item.label}</span>
                            <small>{item.description}</small>
                            <strong>{item.count}회</strong>
                          </div>
                          <span className="confusion-report-page__bar" aria-hidden="true">
                            <span style={{ width: `${barWidth}%` }} />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </article>
          </>
        )}
      </section>

      <section className="confusion-report-page__navigation-actions">
        {!isCaregiverRoute && (
          <button
            type="button"
            className="confusion-report-page__back-button"
            onClick={() => navigate("/patient/confusion")}
          >
            혼동 선택으로 돌아가기
          </button>
        )}
        <button
          type="button"
          className="confusion-report-page__back-button"
          onClick={() => navigate(isCaregiverRoute ? "/caregiver" : "/patient")}
        >
          {isCaregiverRoute ? "보호자 홈으로 돌아가기" : "홈으로 돌아가기"}
        </button>
      </section>
    </main>
  );
}
