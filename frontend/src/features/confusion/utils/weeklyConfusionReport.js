export const CONFUSION_TYPES = [
  { id: "person", label: "사람" },
  { id: "place", label: "장소" },
  { id: "time", label: "시간" },
  { id: "task", label: "해야 할 일" },
  { id: "meal", label: "식사" },
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

export function createWeeklyConfusionReport(events, weekStart) {
  const weekEndExclusive = addDays(weekStart, 7).getTime();
  const weekStartTime = weekStart.getTime();
  const counts = Object.fromEntries(
    CONFUSION_TYPES.map((confusionType) => [confusionType.id, 0]),
  );

  if (Array.isArray(events)) {
    events.forEach((event) => {
      const occurredAt = new Date(event.occurred_at).getTime();

      if (
        Number.isNaN(occurredAt) ||
        occurredAt < weekStartTime ||
        occurredAt >= weekEndExclusive ||
        !(event.confusion_type in counts)
      ) {
        return;
      }

      counts[event.confusion_type] += 1;
    });
  }

  const items = CONFUSION_TYPES.map((confusionType) => ({
    ...confusionType,
    count: counts[confusionType.id],
  }));
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const maximum = Math.max(...items.map((item) => item.count), 0);

  return {
    total,
    maximum,
    items,
  };
}
