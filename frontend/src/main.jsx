import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { setupVisualViewportHeight } from "./shared/layout/setupVisualViewportHeight.js";
import { setupPwaInstallPromptListener } from "./shared/pwa/installPrompt.js";

setupPwaInstallPromptListener();
setupVisualViewportHeight();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
