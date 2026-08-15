export function createPatientAnswerSpeechText(response) {
  if (!response) {
    return "";
  }

  const textParts = [
    response.speechText,
    response.title,
    response.message,
    response.suggestion,
  ]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim());

  return [...new Set(textParts)].join(" ").slice(0, 1000);
}
