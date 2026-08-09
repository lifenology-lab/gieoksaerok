let deferredInstallPrompt = null;

export function setupPwaInstallPromptListener() {
  if (typeof window === "undefined") {
    return;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
  });
}

export function canPromptPwaInstall() {
  return deferredInstallPrompt !== null;
}

export async function promptPwaInstall() {
  if (!deferredInstallPrompt) {
    return {
      prompted: false,
      outcome: "unavailable",
    };
  }

  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;

  promptEvent.prompt();

  const choiceResult = await promptEvent.userChoice;

  return {
    prompted: true,
    outcome: choiceResult.outcome,
  };
}
