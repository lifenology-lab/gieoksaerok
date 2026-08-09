import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { setupPwaInstallPromptListener } from "./shared/pwa/installPrompt.js";

setupPwaInstallPromptListener();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
