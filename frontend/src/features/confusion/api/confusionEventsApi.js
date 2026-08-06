import { request } from "../../../shared/api/client";

export function fetchConfusionEvents() {
  return request("/api/confusion-events/");
}

export function createConfusionEvent({ confusionType, occurredAt }) {
  return request("/api/confusion-events/", {
    method: "POST",
    body: JSON.stringify({
      confusion_type: confusionType,
      occurred_at: occurredAt,
    }),
  });
}
