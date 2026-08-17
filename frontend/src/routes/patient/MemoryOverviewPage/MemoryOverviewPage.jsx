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
import { getApiMediaUrl } from "@/shared/api/client";

import "./MemoryOverviewPage.css";

const TAB_ITEMS = [
  { id: "today", label: "오늘의 기억" },
  { id: "calendar", label: "기억 달력" },
  { id: "memories", label: "기억 회상하기" },
];

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const DATE_WEEKDAY_LABELS = [
  "일요일",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일",
];
const REFLECTION_SESSION_IDLE_MS = 30 * 60 * 1000;
const INITIAL_PEOPLE_CHOOSER_COUNT = 5;
const MEAL_TYPE_ORDER = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
  unknown: 4,
};

function isSameDay(leftDate, rightDate) {
  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getDate() === rightDate.getDate()
  );
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

function formatMemoryOverviewDate(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${DATE_WEEKDAY_LABELS[date.getDay()]})`;
}

function formatMemoryOverviewTime(date) {
  const hours = date.getHours();
  const period = hours < 12 ? "오전" : "오후";
  const displayHours = hours % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${period} ${String(displayHours).padStart(2, "0")}:${minutes}`;
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

function getCalendarDateKey(date) {
  const normalizedDate = new Date(date);

  if (Number.isNaN(normalizedDate.getTime())) {
    return "";
  }

  return `${normalizedDate.getFullYear()}-${String(normalizedDate.getMonth() + 1).padStart(2, "0")}-${String(normalizedDate.getDate()).padStart(2, "0")}`;
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
  const [selectedCalendarItem, setSelectedCalendarItem] = useState(null);
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
  const [isPeopleChooserOpen, setIsPeopleChooserOpen] = useState(false);
  const [isPeopleChooserExpanded, setIsPeopleChooserExpanded] = useState(false);
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
      .sort((left, right) => {
        const typeOrder =
          (MEAL_TYPE_ORDER[left.mealType] ?? MEAL_TYPE_ORDER.unknown) -
          (MEAL_TYPE_ORDER[right.mealType] ?? MEAL_TYPE_ORDER.unknown);

        if (typeOrder !== 0) {
          return typeOrder;
        }

        return new Date(left.eatenAt).getTime() - new Date(right.eatenAt).getTime();
      })
      .slice(0, 4);
  }, [mealRecords]);
  const todayMemories = useMemo(() => {
    const now = new Date();

    return memories
      .filter((memory) => {
        const memoryAt = new Date(memory.memory_at || memory.created_at);
        return !Number.isNaN(memoryAt.getTime()) && isSameDay(memoryAt, now);
      })
      .slice(0, 1);
  }, [memories]);
  const peopleById = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people],
  );
  const reflectionItem = albumItems.length
    ? albumItems[reflectionIndex % albumItems.length]
    : null;
  const calendarDays = useMemo(() => getMonthDays(calendarMonth), [calendarMonth]);
  const calendarRecordTypesByDate = useMemo(() => {
    const recordTypesByDate = new Map();
    const addRecordType = (date, type) => {
      const dateKey = getCalendarDateKey(date);

      if (!dateKey) {
        return;
      }

      const types = recordTypesByDate.get(dateKey) || new Set();
      types.add(type);
      recordTypesByDate.set(dateKey, types);
    };

    mealRecords.forEach((record) => addRecordType(record.eatenAt, "meal"));
    Object.values(scheduleGroups)
      .flat()
      .forEach((promise) => addRecordType(getPromiseDate(promise), "schedule"));
    memories.forEach((memory) => addRecordType(memory.memory_at || memory.created_at, "memory"));

    return recordTypesByDate;
  }, [mealRecords, memories, scheduleGroups]);
  const calendarItems = useMemo(() => {
    const items = [
      ...mealRecords.map((record) => ({
        id: `meal-${record.id}`,
        type: "meal",
        date: new Date(record.eatenAt),
        title: record.mealLabel,
        description: record.menu || "",
        imageUrl: record.sceneImage ? getApiMediaUrl(record.sceneImage) : "",
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
    setIsHintVisible(false);
    setIsPeopleChooserOpen(false);
    setIsPeopleChooserExpanded(false);
    setSelectedCalendarItem(null);
    setIsReflectionAssistantOpen(true);
  };

  const handleMemoryTabChange = (nextTab) => {
    setSelectedCalendarItem(null);
    setIsHintVisible(false);
    setIsPeopleChooserOpen(false);
    setIsPeopleChooserExpanded(false);
    setIsReflectionAssistantOpen(false);
    setActiveTab(nextTab);
  };

  const handleReflectionSessionChange = (albumItemId, nextSession) => {
    setReflectionSessions((sessions) => ({
      ...sessions,
      [albumItemId]: nextSession,
    }));
  };

  return (
    <main className={`memory-overview-page${activeTab === "calendar" ? " is-calendar-active" : ""}${activeTab === "memories" ? " is-reflection-active" : ""}`}>
      <div className="memory-overview-page__background" aria-hidden="true" />

      <header className="memory-overview-page__header">
        <div className="memory-overview-page__date-time" aria-live="polite">
          <p>{formatMemoryOverviewDate(currentDateTime)}</p>
          <strong>{formatMemoryOverviewTime(currentDateTime)}</strong>
          <span aria-hidden="true" />
        </div>
        <button type="button" onClick={() => navigate("/patient")}>홈으로</button>
      </header>

      <section className="memory-overview-page__intro">
        <span aria-hidden="true" />
        <div>
          <h1>기억 살펴보기</h1>
          <p>오늘의 기록과 추억을 함께 봐요.</p>
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
            onClick={() => handleMemoryTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="memory-overview-page__content" aria-live="polite">
        {isLoading && <p className="memory-overview-page__notice is-loading">기억을 준비하고 있어요. 잠시만 기다려 주세요.</p>}
        {!isLoading && loadMessage && <p className="memory-overview-page__notice is-warning">{loadMessage}</p>}

        {!isLoading && activeTab === "today" && (
          <div className="memory-overview-page__panel">
            <section className="memory-overview-page__section-heading">
              <h2>오늘의 식사</h2>
            </section>
            {todayMealRecords.length === 0 ? (
              <p className="memory-overview-page__summary-empty">오늘 남긴 식사 기록이 아직 없어요.</p>
            ) : (
              <ul className="memory-overview-page__today-meal-strip">
                {todayMealRecords.map((record) => (
                  <li key={record.id} className="memory-overview-page__meal-polaroid">
                    {record.sceneImage ? (
                      <img
                        src={getApiMediaUrl(record.sceneImage)}
                        alt={`${record.mealLabel} 식사 사진`}
                      />
                    ) : (
                      <span aria-label={`${record.mealLabel} 식사 사진 없음`} role="img">
                        🍽
                      </span>
                    )}
                    <strong>{record.mealLabel}</strong>
                  </li>
                ))}
              </ul>
            )}
            <button className="memory-overview-page__summary-link" type="button" onClick={openCalendarForToday}>기억 달력에서 모두 보기</button>

            {todayMemories.length > 0 && (
              <section className="memory-overview-page__today-memories">
                <div className="memory-overview-page__section-heading">
                  <h2>오늘 새로 남긴 추억</h2>
                </div>
                <ul className="memory-overview-page__today-memory-list">
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
                  (() => {
                    const recordTypes = calendarRecordTypesByDate.get(getCalendarDateKey(date)) || new Set();
                    const hasRecords = recordTypes.size > 0;
                    const isSelected = isSameDay(date, selectedCalendarDate);
                    const isToday = isSameDay(date, new Date());
                    const recordSummary = [...recordTypes]
                      .map((type) => (type === "meal" ? "식사" : type === "schedule" ? "일정" : "추억"))
                      .join(", ");

                    return (
                      <button
                        key={date.toISOString()}
                        type="button"
                        role="gridcell"
                        className={`${isSelected ? "is-selected" : ""}${isToday ? " is-today" : ""}`.trim()}
                        aria-label={`${formatCalendarDate(date)}${hasRecords ? `, ${recordSummary} 기록 있음` : ""}`}
                        aria-pressed={isSelected}
                        onClick={() => {
                          setSelectedCalendarDate(date);
                          setSelectedCalendarItem(null);
                        }}
                      >
                        <span>{date.getDate()}</span>
                        {hasRecords && (
                          <span className="memory-overview-page__calendar-dots" aria-hidden="true">
                            {[...recordTypes].map((type) => <i key={type} className={`is-${type}`} />)}
                          </span>
                        )}
                      </button>
                    );
                  })()
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
                        <button
                          type="button"
                          className={`memory-overview-page__timeline-card${item.imageUrl ? " has-image" : ""}`}
                          aria-label={`${item.title} 상세 보기`}
                          onClick={() => setSelectedCalendarItem(item)}
                        >
                          {item.imageUrl && <img src={item.imageUrl} alt={`${item.title} 사진`} />}
                          <div className="memory-overview-page__timeline-copy">
                            <span>{item.type === "meal" ? "식사" : item.type === "schedule" ? "일정" : "추억"}</span>
                            <strong>{item.title}</strong>
                            {item.description && <p>{item.description}</p>}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        )}

        {!isLoading && activeTab === "memories" && (
          <div className="memory-overview-page__reflection-stage">
            {isAlbumLoading && <p className="memory-overview-page__empty memory-overview-page__loading-message">추억 사진을 준비하고 있어요. 잠시만 기다려 주세요.</p>}
            {!isAlbumLoading && albumLoadMessage && <p className="memory-overview-page__notice is-warning">{albumLoadMessage}</p>}
            {!isAlbumLoading && !reflectionItem && !albumLoadMessage && (
              <p className="memory-overview-page__empty">아직 함께 볼 추억 사진이 없어요.</p>
            )}
            {!isAlbumLoading && reflectionItem && (
              <section className="memory-overview-page__reflection-viewer">
                <div className="memory-overview-page__reflection-photo">
                  <img
                    src={getMemoryAlbumPhotoUrl(reflectionItem.photo_url)}
                    alt="함께 떠올려 볼 추억 사진"
                    style={{ objectPosition: `${reflectionItem.crop_x ?? 50}% ${reflectionItem.crop_y ?? 50}%` }}
                  />
                  <span>{`${reflectionIndex % albumItems.length + 1} / ${albumItems.length}`}</span>
                  {albumItems.length > 1 && (
                    <button type="button" onClick={handleNextReflection}>다른 추억</button>
                  )}
                </div>
                <div className={`memory-overview-page__reflection-guide${isReflectionAssistantOpen ? " is-conversation-active" : ""}`}>
                  {isReflectionAssistantOpen ? (
                    <MemoryReflectionAssistant
                      reflectionItem={reflectionItem}
                      session={reflectionSessions[reflectionItem.id]}
                      onSessionChange={(nextSession) => (
                        handleReflectionSessionChange(reflectionItem.id, nextSession)
                      )}
                      onClose={() => setIsReflectionAssistantOpen(false)}
                      isEmbedded
                    />
                  ) : (
                    <>
                      <div className="memory-overview-page__reflection-guide-intro">
                        <h2>이 사진을 보며<br />어떤 일이 떠오르세요?</h2>
                        <p>떠오르는 이야기를 새록이에게 들려주세요.</p>
                      </div>
                      <div className="memory-overview-page__reflection-chat-placeholder" aria-live="polite">
                        <p>새록이와 이 사진의 이야기를 나눠 보세요.</p>
                      </div>
                      <div className="memory-overview-page__reflection-actions">
                        <button type="button" onClick={handleTalkAboutReflection}>새록이에게 이야기하기</button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsPeopleChooserOpen(false);
                            setSelectedCalendarItem(null);
                            setIsHintVisible(true);
                          }}
                        >
                          힌트 보기
                        </button>
                        {people.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                            setIsHintVisible(false);
                            setSelectedCalendarItem(null);
                            setIsPeopleChooserExpanded(false);
                            setIsPeopleChooserOpen(true);
                            }}
                          >
                            사람 선택
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </section>

      {selectedCalendarItem && (
        <div
          className="memory-overview-page__record-overlay"
          role="presentation"
          onClick={() => setSelectedCalendarItem(null)}
        >
          <section
            className="memory-overview-page__record-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-record-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="memory-overview-page__record-dialog-close"
              type="button"
              aria-label="기록 상세 닫기"
              onClick={() => setSelectedCalendarItem(null)}
            >
              ×
            </button>
            {selectedCalendarItem.imageUrl && (
              <img src={selectedCalendarItem.imageUrl} alt={`${selectedCalendarItem.title} 사진`} />
            )}
            <span className={`memory-overview-page__record-dialog-type is-${selectedCalendarItem.type}`}>
              {selectedCalendarItem.type === "meal" ? "식사 기록" : selectedCalendarItem.type === "schedule" ? "일정" : "추억"}
            </span>
            <h2 id="calendar-record-title">{selectedCalendarItem.title}</h2>
            {selectedCalendarItem.description && <p>{selectedCalendarItem.description}</p>}
          </section>
        </div>
      )}

      {isHintVisible && reflectionItem && (
        <div className="memory-overview-page__reflection-overlay" role="presentation" onClick={() => setIsHintVisible(false)}>
          <section className="memory-overview-page__reflection-dialog" role="dialog" aria-modal="true" aria-labelledby="reflection-hint-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" aria-label="힌트 닫기" onClick={() => setIsHintVisible(false)}>×</button>
            <span>기억의 힌트</span>
            <h2 id="reflection-hint-title">{getPersonLabel(reflectionItem.person)}과 함께한 추억이에요.</h2>
            <p>{reflectionItem.description || "사진을 보며 함께한 시간을 천천히 떠올려 보세요."}</p>
          </section>
        </div>
      )}

      {isPeopleChooserOpen && (
        <div className="memory-overview-page__reflection-overlay" role="presentation" onClick={() => setIsPeopleChooserOpen(false)}>
          <section className="memory-overview-page__reflection-dialog" role="dialog" aria-modal="true" aria-labelledby="reflection-people-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" aria-label="사람 선택 닫기" onClick={() => {
              setIsPeopleChooserOpen(false);
              setIsPeopleChooserExpanded(false);
            }}>×</button>
            <span>사람별 추억</span>
            <h2 id="reflection-people-title">누구와의 추억을 살펴볼까요?</h2>
            <div className="memory-overview-page__reflection-person-list">
              {people.slice(0, isPeopleChooserExpanded ? people.length : INITIAL_PEOPLE_CHOOSER_COUNT).map((person) => (
                <button key={person.id} type="button" onClick={() => handleOpenAlbum(person)}>{getPersonLabel(person)}</button>
              ))}
              {people.length > INITIAL_PEOPLE_CHOOSER_COUNT && (
                <button
                  type="button"
                  className="memory-overview-page__reflection-people-more"
                  onClick={() => setIsPeopleChooserExpanded((expanded) => !expanded)}
                >
                  {isPeopleChooserExpanded ? "접기" : `${people.length - INITIAL_PEOPLE_CHOOSER_COUNT}명 더 보기`}
                </button>
              )}
            </div>
          </section>
        </div>
      )}

    </main>
  );
}
