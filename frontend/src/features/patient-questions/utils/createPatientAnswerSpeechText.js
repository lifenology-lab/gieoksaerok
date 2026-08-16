export function createPatientAnswerSpeechText(response) {
  if (!response) {
    return "";
  }

  if (typeof response.speechText === "string" && response.speechText.trim()) {
    return response.speechText.trim().slice(0, 220);
  }

  const textParts = [
    response.title,
    response.message,
    response.suggestion,
    ...(response.upcomingPromises || []),
  ]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim());

  return [...new Set(textParts)].join(" ").slice(0, 1000);
}
