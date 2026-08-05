export const CONFUSION_TYPES = [
  { id: "person", label: "사람" },
  { id: "place", label: "장소" },
  { id: "time", label: "시간" },
  { id: "task", label: "해야 할 일" },
  { id: "meal", label: "식사" },
];

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const TIME_PERIODS = [
  { id: "morning", label: "오전", description: "05~11시" },
  { id: "afternoon", label: "오후", description: "12~17시" },
  { id: "evening", label: "저녁", description: "18~21시" },
  { id: "night", label: "밤", description: "22~04시" },
];

export function getWeekStart(date = new Date()) {
  const weekStart = new Date(date);
  const day = weekStart.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;

  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - daysSinceMonday);

  return weekStart;
}

export function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
}

export function formatWeekRange(weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const year = weekStart.getFullYear();
  const startMonth = weekStart.getMonth() + 1;
  const endMonth = weekEnd.getMonth() + 1;

  if (startMonth === endMonth) {
    return `${year}년 ${startMonth}월 ${weekStart.getDate()}일 ~ ${weekEnd.getDate()}일`;
  }

  return `${year}년 ${startMonth}월 ${weekStart.getDate()}일 ~ ${endMonth}월 ${weekEnd.getDate()}일`;
}

function getWeekEvents(events, weekStart) {
  const weekStartTime = weekStart.getTime();
  const weekEndExclusive = addDays(weekStart, 7).getTime();

  if (!Array.isArray(events)) {
    return [];
  }

  return events.filter((event) => {
    const occurredAt = new Date(event.occurred_at).getTime();

    return (
      !Number.isNaN(occurredAt) &&
      occurredAt >= weekStartTime &&
      occurredAt < weekEndExclusive
    );
  });
}

function getTimePeriodId(hour) {
  if (hour >= 5 && hour < 12) {
    return "morning";
  }

  if (hour < 18) {
    return "afternoon";
  }

  if (hour < 22) {
    return "evening";
  }

  return "night";
}

export function createWeeklyConfusionReport(events, weekStart) {
  const weekEvents = getWeekEvents(events, weekStart);
  const counts = Object.fromEntries(
    CONFUSION_TYPES.map((confusionType) => [confusionType.id, 0]),
  );
  const dailyCounts = Array(7).fill(0);
  const timePeriodCounts = Object.fromEntries(
    TIME_PERIODS.map((timePeriod) => [timePeriod.id, 0]),
  );

  weekEvents.forEach((event) => {
    const occurredAt = new Date(event.occurred_at);

    if (event.confusion_type in counts) {
      counts[event.confusion_type] += 1;
    }

    const weekdayIndex = (occurredAt.getDay() + 6) % 7;
    dailyCounts[weekdayIndex] += 1;
    timePeriodCounts[getTimePeriodId(occurredAt.getHours())] += 1;
  });

  const items = CONFUSION_TYPES.map((confusionType) => ({
    ...confusionType,
    count: counts[confusionType.id],
  }));
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const maximum = Math.max(...items.map((item) => item.count), 0);
  const daily = dailyCounts.map((count, index) => ({
    id: index,
    label: WEEKDAY_LABELS[index],
    count,
  }));
  const timePeriods = TIME_PERIODS.map((timePeriod) => ({
    ...timePeriod,
    count: timePeriodCounts[timePeriod.id],
  }));
  const topItems = maximum === 0
    ? []
    : items.filter((item) => item.count === maximum);

  return {
    total,
    maximum,
    items,
    daily,
    maximumDaily: Math.max(...dailyCounts, 0),
    timePeriods,
    maximumTimePeriod: Math.max(...timePeriods.map((item) => item.count), 0),
    topItems,
  };
}
