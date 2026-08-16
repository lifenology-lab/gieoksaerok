const MAX_SPEECH_SENTENCES = 2;
const MAX_SPEECH_CHARACTERS = 150;

function shortenSentence(sentence) {
  if (sentence.length <= MAX_SPEECH_CHARACTERS) {
    return sentence;
  }

  const shortened = sentence.slice(0, MAX_SPEECH_CHARACTERS + 1);
  const lastSpaceIndex = shortened.lastIndexOf(" ");

  return `${shortened.slice(0, Math.max(lastSpaceIndex, 1)).trim()}…`;
}

// 화면에는 전체 답변을 유지하고, 음성으로는 부담 없는 핵심만 전달한다.
export function createMemoryReflectionSpeechText(reply) {
  const normalizedReply = typeof reply === "string"
    ? reply.replace(/\s+/g, " ").trim()
    : "";

  if (!normalizedReply) {
    return "";
  }

  const sentences = normalizedReply.match(/[^.!?。]+[.!?。]*/g) || [];
  const speechText = sentences
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, MAX_SPEECH_SENTENCES)
    .join(" ");

  return shortenSentence(speechText || normalizedReply);
}
