import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { fetchPeople } from "@/features/face-recognition/api/peopleApi";
import { fetchMealRecords } from "@/features/meal-recognition/api/mealRecognitionApi";
import {
  fetchPatientMemories,
  fetchPatientMemorySchedules,
} from "@/features/patient-memory/api/patientMemoryApi";
import { getApiMediaUrl } from "@/shared/api/client";

import "./MemoryOverviewPage.css";

const TAB_ITEMS = [
  { id: "today", label: "오늘의 기억" },
  { id: "meals", label: "식사 기록" },
  { id: "schedule", label: "일정" },
  { id: "memories", label: "추억 살펴보기" },
];

const SCHEDULE_GROUPS = [
  { id: "past", title: "이전 일정", emptyMessage: "최근에 지나간 일정이 없어요." },
  { id: "today", title: "오늘 일정", emptyMessage: "오늘 예정된 일정이 없어요." },
  { id: "upcoming", title: "다가오는 일정", emptyMessage: "앞으로 예정된 일정이 없어요." },
];

function isSameDay(leftDate, rightDate) {
  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getDate() === rightDate.getDate()
  );
}

function formatMealTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "기록된 시간";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatPromiseTime(promise) {
  const scheduledAt = promise.scheduled_at
    ? new Date(promise.scheduled_at)
    : null;

  if (scheduledAt && !Number.isNaN(scheduledAt.getTime())) {
    const isToday = isSameDay(scheduledAt, new Date());
    const dateLabel = isToday
      ? "오늘"
      : `${scheduledAt.getMonth() + 1}월 ${scheduledAt.getDate()}일`;

    return `${dateLabel} ${new Intl.DateTimeFormat("ko-KR", {
      hour: "numeric",
      minute: "2-digit",
    }).format(scheduledAt)}`;
  }

  if (promise.scheduled_date) {
    const scheduledDate = new Date(`${promise.scheduled_date}T00:00:00`);

    if (!Number.isNaN(scheduledDate.getTime())) {
      const dateLabel = isSameDay(scheduledDate, new Date())
        ? "오늘"
        : `${scheduledDate.getMonth() + 1}월 ${scheduledDate.getDate()}일`;

      return promise.time_label ? `${dateLabel} ${promise.time_label}` : dateLabel;
    }
  }

  return promise.time_label || "예정된 시간";
}

function getPersonLabel(person) {
  if (person.relationship) {
    return `${person.relationship} ${person.name}님`;
  }

  return `${person.name}님`;
}

function getPersonSummary(person) {
  const card = person.latest_summary?.card;

  return card?.body || card?.title || "함께한 추억을 살펴볼 수 있어요.";
}

function getMemoryTitle(memory) {
  const recap = memory.recap || {};

  return recap.title || recap.headline || "새로 남긴 추억";
}

function getMemoryDescription(memory) {
  const recap = memory.recap || {};

  return recap.description || recap.summary || "오늘 나눈 이야기를 남겨 두었어요.";
}

export default function MemoryOverviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(
    location.state?.activeTab || "today",
  );
  const [mealRecords, setMealRecords] = useState([]);
  const [scheduleGroups, setScheduleGroups] = useState({
    past: [],
    today: [],
    upcoming: [],
  });
  const [people, setPeople] = useState([]);
  const [memories, setMemories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadMessage, setLoadMessage] = useState("");
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => setCurrentDateTime(new Date()), 30000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadMemoryOverview() {
      setIsLoading(true);
      setLoadMessage("");

      const results = await Promise.allSettled([
        fetchMealRecords(),
        fetchPatientMemorySchedules(),
        fetchPeople(),
        fetchPatientMemories(),
      ]);

      if (!isMounted) {
        return;
      }

      const [mealResult, promiseResult, peopleResult, memoryResult] = results;
      setMealRecords(mealResult.status === "fulfilled" ? mealResult.value : []);
      setScheduleGroups(
        promiseResult.status === "fulfilled"
          ? {
              past: promiseResult.value.past || [],
              today: promiseResult.value.today || [],
              upcoming: promiseResult.value.upcoming || [],
            }
          : { past: [], today: [], upcoming: [] },
      );
      setPeople(peopleResult.status === "fulfilled" ? peopleResult.value : []);
      setMemories(memoryResult.status === "fulfilled" ? memoryResult.value : []);

      if (results.every((result) => result.status === "rejected")) {
        setLoadMessage("기억을 불러오지 못했어요. 잠시 후 다시 열어 주세요.");
      } else if (results.some((result) => result.status === "rejected")) {
        setLoadMessage("일부 기록을 불러오지 못했어요.");
      }

      setIsLoading(false);
    }

    loadMemoryOverview();

    return () => {
      isMounted = false;
    };
  }, []);

  const todayMealRecords = useMemo(() => {
    const now = new Date();

    return mealRecords
      .filter((record) => {
        const eatenAt = new Date(record.eatenAt);
        return !Number.isNaN(eatenAt.getTime()) && isSameDay(eatenAt, now);
      })
      .slice(0, 2);
  }, [mealRecords]);
  const todayMemories = useMemo(() => {
    const now = new Date();

    return memories
      .filter((memory) => {
        const memoryAt = new Date(memory.memory_at || memory.created_at);
        return !Number.isNaN(memoryAt.getTime()) && isSameDay(memoryAt, now);
      })
      .slice(0, 2);
  }, [memories]);
  const peopleById = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people],
  );

  const handleOpenAlbum = (person) => {
    navigate(`/patient/memory-album/${person.id}`, { state: { person } });
  };

  return (
    <main className="memory-overview-page">
      <div className="memory-overview-page__background" aria-hidden="true" />

      <header className="memory-overview-page__header">
        <div className="memory-overview-page__date-time" aria-live="polite">
          <p>{`${currentDateTime.getFullYear()}년 ${currentDateTime.getMonth() + 1}월 ${currentDateTime.getDate()}일`}</p>
          <strong>{new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" }).format(currentDateTime)}</strong>
          <span aria-hidden="true" />
        </div>
        <button type="button" onClick={() => navigate("/patient")}>홈으로</button>
      </header>

      <section className="memory-overview-page__intro">
        <span aria-hidden="true" />
        <div>
          <h1>기억 살펴보기</h1>
          <p>오늘의 이야기와 소중한 기억을 함께 살펴봐요.</p>
        </div>
      </section>

      <nav className="memory-overview-page__tabs" aria-label="기억 살펴보기 메뉴" role="tablist">
        {TAB_ITEMS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "is-active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="memory-overview-page__content" aria-live="polite">
        {isLoading && <p className="memory-overview-page__notice">기억을 준비하고 있어요.</p>}
        {!isLoading && loadMessage && <p className="memory-overview-page__notice is-warning">{loadMessage}</p>}

        {!isLoading && activeTab === "today" && (
          <div className="memory-overview-page__panel">
            <section className="memory-overview-page__today-time">
              <span>지금은</span>
              <strong>{new Intl.DateTimeFormat("ko-KR", { weekday: "long", hour: "numeric", minute: "2-digit" }).format(currentDateTime)}</strong>
              <p>하나씩 천천히 확인해도 괜찮아요.</p>
            </section>
            <section className="memory-overview-page__section-heading">
              <h2>오늘의 식사</h2>
              <p>오늘 남긴 식사를 간단히 확인할 수 있어요.</p>
            </section>
            {todayMealRecords.length === 0 ? (
              <p className="memory-overview-page__summary-empty">오늘 남긴 식사 기록이 아직 없어요.</p>
            ) : (
              <ul className="memory-overview-page__summary-list">
                {todayMealRecords.map((record) => (
                  <li key={record.id}>
                    <strong>{record.mealLabel}</strong>
                    <span>{record.menu || formatMealTime(record.eatenAt)}</span>
                  </li>
                ))}
              </ul>
            )}
            <button className="memory-overview-page__summary-link" type="button" onClick={() => setActiveTab("meals")}>식사 기록 보기</button>

            <section className="memory-overview-page__section-heading">
              <h2>오늘의 일정</h2>
              <p>오늘 예정된 일을 하나씩 살펴볼 수 있어요.</p>
            </section>
            {scheduleGroups.today.length === 0 ? (
              <p className="memory-overview-page__summary-empty">오늘 예정된 일정이 없어요.</p>
            ) : (
              <ul className="memory-overview-page__summary-list">
                {scheduleGroups.today.slice(0, 2).map((promise) => (
                  <li key={promise.id}>
                    <strong>{promise.title || "예정된 약속"}</strong>
                    <span>{formatPromiseTime(promise)}</span>
                  </li>
                ))}
              </ul>
            )}
            <button className="memory-overview-page__summary-link" type="button" onClick={() => setActiveTab("schedule")}>일정 모두 보기</button>

            {todayMemories.length > 0 && (
              <section className="memory-overview-page__today-memories">
                <div className="memory-overview-page__section-heading">
                  <h2>오늘 새로 남긴 추억</h2>
                  <p>오늘 나눈 이야기를 다시 살펴볼 수 있어요.</p>
                </div>
                <ul className="memory-overview-page__summary-list">
                  {todayMemories.map((memory) => {
                    const person = peopleById.get(memory.person);

                    return (
                      <li key={memory.id}>
                        <strong>{getMemoryTitle(memory)}</strong>
                        <span>{person ? getPersonLabel(person) : getMemoryDescription(memory)}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        )}

        {!isLoading && activeTab === "meals" && (
          <div className="memory-overview-page__panel">
            <section className="memory-overview-page__section-heading">
              <h2>오늘의 식사</h2>
              <p>오늘 남긴 식사 기록을 살펴볼 수 있어요.</p>
            </section>
            {todayMealRecords.length === 0 ? (
              <p className="memory-overview-page__empty">오늘 남긴 식사 기록이 아직 없어요.</p>
            ) : (
              <ul className="memory-overview-page__meal-list">
                {todayMealRecords.map((record) => (
                  <li key={record.id}>
                    {record.sceneImage ? <img src={getApiMediaUrl(record.sceneImage)} alt={`${record.mealLabel} 식사 사진`} /> : <span aria-hidden="true">식사</span>}
                    <div>
                      <strong>{record.mealLabel}</strong>
                      <time dateTime={record.eatenAt}>{formatMealTime(record.eatenAt)}</time>
                      {record.menu && <p>{record.menu}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button className="memory-overview-page__view-all-button" type="button" onClick={() => navigate("/patient/meal-records")}>식사 기록 모두 보기</button>
          </div>
        )}

        {!isLoading && activeTab === "schedule" && (
          <div className="memory-overview-page__panel">
            <section className="memory-overview-page__section-heading">
              <h2>가까운 일정</h2>
              <p>예정된 약속을 하나씩 확인해 볼 수 있어요.</p>
            </section>
            <div className="memory-overview-page__schedule-groups">
              {SCHEDULE_GROUPS.map((group) => (
                <section key={group.id}>
                  <h3>{group.title}</h3>
                  {scheduleGroups[group.id].length === 0 ? (
                    <p className="memory-overview-page__schedule-empty">{group.emptyMessage}</p>
                  ) : (
                    <ul className="memory-overview-page__schedule-list">
                      {scheduleGroups[group.id].map((promise) => (
                        <li key={promise.id}>
                          <time>{formatPromiseTime(promise)}</time>
                          <strong>{promise.title || "예정된 약속"}</strong>
                          <p>{promise.person_name ? `${promise.person_relationship ? `${promise.person_relationship} ` : ""}${promise.person_name}님과의 약속이에요.` : promise.description}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          </div>
        )}

        {!isLoading && activeTab === "memories" && (
          <div className="memory-overview-page__panel">
            <section className="memory-overview-page__section-heading">
              <h2>소중한 사람들</h2>
              <p>사람을 누르면 함께한 추억 카드를 볼 수 있어요.</p>
            </section>
            {people.length === 0 ? (
              <p className="memory-overview-page__empty">아직 등록된 소중한 사람이 없어요.</p>
            ) : (
              <ul className="memory-overview-page__people-list">
                {people.map((person) => (
                  <li key={person.id}>
                    <div>
                      <strong>{getPersonLabel(person)}</strong>
                      <p>{getPersonSummary(person)}</p>
                    </div>
                    <button type="button" onClick={() => handleOpenAlbum(person)}>추억 보기</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
