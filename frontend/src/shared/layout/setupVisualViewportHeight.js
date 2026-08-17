export function setupVisualViewportHeight() {
  if (typeof window === "undefined") {
    return () => {};
  }

  const viewport = window.visualViewport;
  const root = document.documentElement;
  const updateViewportHeight = () => {
    const height = viewport?.height || window.innerHeight;

    root.style.setProperty("--visual-viewport-height", `${Math.round(height)}px`);
  };

  updateViewportHeight();
  window.addEventListener("resize", updateViewportHeight);
  viewport?.addEventListener("resize", updateViewportHeight);

  return () => {
    window.removeEventListener("resize", updateViewportHeight);
    viewport?.removeEventListener("resize", updateViewportHeight);
  };
}
