import { request } from "@/shared/api/client";

export function fetchPatientMemorySchedules() {
  return request("/api/patient-memory/schedules/");
}

export function fetchPatientMemories() {
  return request("/api/memories/");
}
