const MOCK_DELAY_MS = 1000; // 임시로 기다릴 시간

const wait = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

export async function detectMealScene() {
  await wait(MOCK_DELAY_MS);

  // mock data 리턴
  // 최근 식사 데이터가 있는데 중복 식사가 감지된 경우
  return {
    isMealScene: true,
    hasRecentMealRecord: true,
    card: {
      type: "recent_meal_found",
      title: "최근 식사 기록이 있어요",
      message: "2시간 전 식사 기록이 확인되었어요.",
      suggestion: "지금은 따뜻한 차를 마시며 쉬어볼까요?",
      primaryActionLabel: "식사 기록 보기",
      secondaryActionLabel: "안내 닫기",
    },
  };
}
