import { request } from "@/shared/api/client";

export function fetchPatientMemorySchedules() {
  return request("/api/patient-memory/schedules/");
}

export function fetchPatientMemories() {
  return request("/api/memories/");
}

export function requestMemoryReflectionAudio({
  personId,
  albumItemId,
  audioBlob,
  history = [],
  summary = "",
}) {
  const formData = new FormData();
  const extension = audioBlob.type.includes("mp4") ? "mp4" : "webm";

  formData.append("audio", audioBlob, `memory-reflection.${extension}`);
  formData.append("person_id", personId);
  formData.append("album_item_id", albumItemId);
  formData.append("history", JSON.stringify(history));
  formData.append("summary", summary);

  return request("/api/patient-memory/reflections/audio/", {
    method: "POST",
    body: formData,
  });
}

export function requestMemoryReflectionText({
  personId,
  albumItemId,
  transcript,
  history = [],
  summary = "",
}) {
  return request("/api/patient-memory/reflections/text/", {
    method: "POST",
    body: JSON.stringify({
      person_id: personId,
      album_item_id: albumItemId,
      transcript,
      history,
      summary,
    }),
  });
}
