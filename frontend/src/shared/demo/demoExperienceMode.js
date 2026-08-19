const DEMO_EXPERIENCE_MODE_KEY = "gieoksaerok.demoExperienceMode";

export const DEMO_EXPERIENCE_MODES = {
  REAR_CAMERA: "rear-camera",
  EXAMPLE_SCENES: "example-scenes",
};

export function setDemoExperienceMode(mode) {
  window.sessionStorage.setItem(DEMO_EXPERIENCE_MODE_KEY, mode);
}

export function getDemoExperienceMode() {
  return window.sessionStorage.getItem(DEMO_EXPERIENCE_MODE_KEY);
}

export function clearDemoExperienceMode() {
  window.sessionStorage.removeItem(DEMO_EXPERIENCE_MODE_KEY);
}
