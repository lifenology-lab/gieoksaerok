import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { fetchPeople } from "@/features/face-recognition/api/peopleApi";
import {
  fetchMemoryAlbumItems,
  getMemoryAlbumPhotoUrl,
} from "@/features/memory-album/api/memoryAlbumApi";
import { fetchMealRecords } from "@/features/meal-recognition/api/mealRecognitionApi";
import {
  fetchPatientMemories,
  fetchPatientMemorySchedules,
} from "@/features/patient-memory/api/patientMemoryApi";
import MemoryReflectionAssistant from "@/features/patient-memory/components/MemoryReflectionAssistant";

import "./MemoryOverviewPage.css";

const TAB_ITEMS = [
  { id: "today", label: "오늘의 기억" },
  { id: "calendar", label: "기억 달력" },
  { id: "memories", label: "기억 회상하기" },
];

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const REFLECTION_SESSION_IDLE_MS = 30 * 60 * 1000;

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

function getPromiseDate(promise) {
  if (promise.scheduled_at) {
    const scheduledAt = new Date(promise.scheduled_at);

    if (!Number.isNaN(scheduledAt.getTime())) {
      return scheduledAt;
    }
  }

  if (promise.scheduled_date) {
    const scheduledDate = new Date(`${promise.scheduled_date}T00:00:00`);

    if (!Number.isNaN(scheduledDate.getTime())) {
      return scheduledDate;
    }
  }

  return null;
}

function formatCalendarDate(date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAY_LABELS[(date.getDay() + 6) % 7]}요일`;
}

function getMonthDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const mondayFirstOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return [
    ...Array(mondayFirstOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) =>
      new Date(year, month, index + 1),
    ),
  ];
}

function formatTimelineTime(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getPersonLabel(person) {
  if (person.relationship) {
    return `${person.relationship} ${person.name}님`;
  }

  return `${person.name}님`;
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
    TAB_ITEMS.some((tab) => tab.id === location.state?.activeTab)
      ? location.state.activeTab
      : "today",
  );
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(
    () => new Date(),
  );
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [mealRecords, setMealRecords] = useState([]);
  const [scheduleGroups, setScheduleGroups] = useState({
    past: [],
    today: [],
    upcoming: [],
  });
  const [people, setPeople] = useState([]);
  const [memories, setMemories] = useState([]);
  const [albumItems, setAlbumItems] = useState([]);
  const [isAlbumLoading, setIsAlbumLoading] = useState(false);
  const [albumLoadMessage, setAlbumLoadMessage] = useState("");
  const [reflectionIndex, setReflectionIndex] = useState(0);
  const [isHintVisible, setIsHintVisible] = useState(false);
  const [isReflectionAssistantOpen, setIsReflectionAssistantOpen] = useState(false);
  const [reflectionSessions, setReflectionSessions] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadMessage, setLoadMessage] = useState("");
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => setCurrentDateTime(new Date()), 30000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const expirationTime = Date.now() - REFLECTION_SESSION_IDLE_MS;

      setReflectionSessions((sessions) => Object.fromEntries(
        Object.entries(sessions).filter(([, session]) => (
          session.lastActiveAt > expirationTime
        )),
      ));
    }, 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (activeTab !== "memories" || people.length === 0 || albumItems.length) {
      return;
    }

    let isMounted = true;

    async function loadAlbumItems() {
      setIsAlbumLoading(true);
      setAlbumLoadMessage("");
      const results = await Promise.allSettled(
        people.map(async (person) => ({
          person,
          items: await fetchMemoryAlbumItems(person.id),
        })),
      );

      if (!isMounted) {
        return;
      }

      const nextAlbumItems = results.flatMap((result) => {
        if (result.status !== "fulfilled") {
          return [];
        }

        return result.value.items.map((item) => ({
          ...item,
          person: result.value.person,
        }));
      });

      setAlbumItems(nextAlbumItems);

      if (results.every((result) => result.status === "rejected")) {
        setAlbumLoadMessage("추억 사진을 불러오지 못했어요. 잠시 후 다시 열어 주세요.");
      } else if (results.some((result) => result.status === "rejected")) {
        setAlbumLoadMessage("일부 추억 사진을 불러오지 못했어요.");
      }

      setIsAlbumLoading(false);
    }

    loadAlbumItems();

    return () => {
      isMounted = false;
    };
  }, [activeTab, albumItems.length, people]);

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
  const reflectionItem = albumItems.length
    ? albumItems[reflectionIndex % albumItems.length]
    : null;
  const calendarDays = useMemo(() => getMonthDays(calendarMonth), [calendarMonth]);
  const calendarItems = useMemo(() => {
    const items = [
      ...mealRecords.map((record) => ({
        id: `meal-${record.id}`,
        type: "meal",
        date: new Date(record.eatenAt),
        title: record.mealLabel,
        description: record.menu || "남긴 식사 기록",
      })),
      ...Object.values(scheduleGroups).flat().map((promise) => ({
        id: `schedule-${promise.id}`,
        type: "schedule",
        date: getPromiseDate(promise),
        title: promise.title || "예정된 약속",
        description: promise.person_name
          ? `${promise.person_relationship ? `${promise.person_relationship} ` : ""}${promise.person_name}님과의 약속`
          : promise.description,
      })),
      ...memories.map((memory) => ({
        id: `memory-${memory.id}`,
        type: "memory",
        date: new Date(memory.memory_at || memory.created_at),
        title: getMemoryTitle(memory),
        description: peopleById.get(memory.person)
          ? getPersonLabel(peopleById.get(memory.person))
          : getMemoryDescription(memory),
      })),
    ];

    return items
      .filter((item) => item.date && !Number.isNaN(item.date.getTime()))
      .filter((item) => isSameDay(item.date, selectedCalendarDate))
      .sort((left, right) => left.date.getTime() - right.date.getTime());
  }, [mealRecords, memories, peopleById, scheduleGroups, selectedCalendarDate]);

  const openCalendarForToday = () => {
    const today = new Date();
    setSelectedCalendarDate(today);
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setActiveTab("calendar");
  };

  const handleOpenAlbum = (person) => {
    navigate(`/patient/memory-album/${person.id}`, { state: { person } });
  };

  const handleNextReflection = () => {
    if (!albumItems.length) {
      return;
    }

    setReflectionIndex((index) => (index + 1) % albumItems.length);
    setIsHintVisible(false);
    setIsReflectionAssistantOpen(false);
  };

  const handleTalkAboutReflection = () => {
    setIsReflectionAssistantOpen(true);
  };

  const handleReflectionSessionChange = (albumItemId, nextSession) => {
    setReflectionSessions((sessions) => ({
      ...sessions,
      [albumItemId]: nextSession,
    }));
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
            <button className="memory-overview-page__summary-link" type="button" onClick={openCalendarForToday}>오늘 기록 보기</button>

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
            <button className="memory-overview-page__summary-link" type="button" onClick={openCalendarForToday}>오늘 기록 보기</button>

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

        {!isLoading && activeTab === "calendar" && (
          <div className="memory-overview-page__calendar-layout">
            <section className="memory-overview-page__calendar-panel">
              <div className="memory-overview-page__section-heading">
                <h2>기억 달력</h2>
                <p>날짜를 고르면 그날의 식사, 일정, 추억을 함께 볼 수 있어요.</p>
              </div>
              <div className="memory-overview-page__calendar-actions">
                <button
                  type="button"
                  aria-label="이전 달 보기"
                  onClick={() => setCalendarMonth((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}
                >
                  ‹
                </button>
                <strong>{`${calendarMonth.getFullYear()}년 ${calendarMonth.getMonth() + 1}월`}</strong>
                <button
                  type="button"
                  aria-label="다음 달 보기"
                  onClick={() => setCalendarMonth((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}
                >
                  ›
                </button>
              </div>
              <div className="memory-overview-page__calendar-weekdays" aria-hidden="true">
                {WEEKDAY_LABELS.map((label) => <span key={label}>{label}</span>)}
              </div>
              <div className="memory-overview-page__calendar-days" role="grid" aria-label="날짜 선택">
                {calendarDays.map((date, index) => date ? (
                  <button
                    key={date.toISOString()}
                    type="button"
                    role="gridcell"
                    className={isSameDay(date, selectedCalendarDate) ? "is-selected" : ""}
                    aria-pressed={isSameDay(date, selectedCalendarDate)}
                    onClick={() => setSelectedCalendarDate(date)}
                  >
                    {date.getDate()}
                  </button>
                ) : <span key={`blank-${index}`} aria-hidden="true" />)}
              </div>
            </section>
            <section className="memory-overview-page__timeline-panel">
              <div className="memory-overview-page__timeline" aria-live="polite">
                <h3>{formatCalendarDate(selectedCalendarDate)}</h3>
                {calendarItems.length === 0 ? (
                  <p className="memory-overview-page__empty">이날 남겨진 기록이 아직 없어요.</p>
                ) : (
                  <ul>
                    {calendarItems.map((item) => (
                      <li key={item.id} data-type={item.type}>
                        <time>{formatTimelineTime(item.date)}</time>
                        <div>
                          <span>{item.type === "meal" ? "식사" : item.type === "schedule" ? "일정" : "추억"}</span>
                          <strong>{item.title}</strong>
                          {item.description && <p>{item.description}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        )}

        {!isLoading && activeTab === "memories" && (
          <div className="memory-overview-page__panel">
            <section className="memory-overview-page__section-heading">
              <h2>기억 회상하기</h2>
              <p>사진을 보며 떠오르는 이야기를 천천히 말해 보세요.</p>
            </section>
            {isAlbumLoading && <p className="memory-overview-page__empty">추억 사진을 준비하고 있어요.</p>}
            {!isAlbumLoading && albumLoadMessage && <p className="memory-overview-page__notice is-warning">{albumLoadMessage}</p>}
            {!isAlbumLoading && !reflectionItem && !albumLoadMessage && (
              <p className="memory-overview-page__empty">아직 함께 볼 추억 사진이 없어요.</p>
            )}
            {!isAlbumLoading && reflectionItem && (
              <section className="memory-overview-page__reflection-photo-card">
                <img
                  src={getMemoryAlbumPhotoUrl(reflectionItem.photo_url)}
                  alt="함께 떠올려 볼 추억 사진"
                  style={{ objectPosition: `${reflectionItem.crop_x ?? 50}% ${reflectionItem.crop_y ?? 50}%` }}
                />
                <div>
                  <h3>이 사진을 보며 어떤 일이 떠오르세요?</h3>
                  {isHintVisible ? (
                    <p>{`${getPersonLabel(reflectionItem.person)}과 함께한 추억이에요. ${reflectionItem.description}`}</p>
                  ) : (
                    <button type="button" className="memory-overview-page__hint-button" onClick={() => setIsHintVisible(true)}>힌트 보기</button>
                  )}
                </div>
                <div className="memory-overview-page__reflection-actions">
                  <button type="button" onClick={handleTalkAboutReflection}>새록이에게 이야기하기</button>
                  {albumItems.length > 1 && <button type="button" onClick={handleNextReflection}>다른 추억 보기</button>}
                </div>
              </section>
            )}
            {isReflectionAssistantOpen && reflectionItem && (
              <MemoryReflectionAssistant
                reflectionItem={reflectionItem}
                session={reflectionSessions[reflectionItem.id]}
                onSessionChange={(nextSession) => (
                  handleReflectionSessionChange(reflectionItem.id, nextSession)
                )}
                onClose={() => setIsReflectionAssistantOpen(false)}
              />
            )}
            {people.length > 0 && (
              <section className="memory-overview-page__people-shortcuts">
                <h3>사람별 추억 보기</h3>
                <div>
                  {people.map((person) => (
                    <button key={person.id} type="button" onClick={() => handleOpenAlbum(person)}>{getPersonLabel(person)}</button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
