import { request } from "../../../shared/api/client";

export function fetchPeople() {
  return request("/api/people/");
}

function buildCoreMemory(value) {
  const summary = value?.trim();

  if (!summary) {
    return {};
  }

  return { summary };
}

export function createPerson({ name, relationship, coreMemory, faceDescriptor }) {
  return request("/api/people/", {
    method: "POST",
    body: JSON.stringify({
      name,
      relationship,
      core_memory: buildCoreMemory(coreMemory),
      face_descriptor: Array.from(faceDescriptor),
    }),
  });
}
