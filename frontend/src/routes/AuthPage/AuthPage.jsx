import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../features/auth/context/authContextValue";
import {
  DEMO_EXPERIENCE_MODES,
  setDemoExperienceMode,
} from "../../shared/demo/demoExperienceMode";

import "./AuthPage.css";

function getRedirectPath(location) {
  const fromPath = location.state?.from?.pathname;

  if (!fromPath || fromPath === "/") {
    return "/roles";
  }

  return fromPath;
}

const EXPERIENCE_OPTIONS = [
  {
    id: DEMO_EXPERIENCE_MODES.REAR_CAMERA,
    title: "후면 카메라로 체험하기",
    description: "주변 인물과 식사 장면을 직접 인식해 볼 수 있어요.",
  },
  {
    id: DEMO_EXPERIENCE_MODES.EXAMPLE_SCENES,
    title: "예시 장면으로 체험하기",
    description: "노트북에서는 준비된 인물·식사 장면으로 편하게 살펴볼 수 있어요.",
  },
];

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { beginDemoExperience } = useAuth();
  const [experienceMode, setExperienceMode] = useState(
    DEMO_EXPERIENCE_MODES.REAR_CAMERA,
  );
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleStartDemo = async () => {
    try {
      setIsStarting(true);
      setErrorMessage("");
      await beginDemoExperience({ mode: experienceMode });
      setDemoExperienceMode(experienceMode);
      navigate(getRedirectPath(location), { replace: true });
    } catch (error) {
      setErrorMessage(error?.message || "데모 체험을 시작하지 못했어요.");
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-page__panel" aria-labelledby="demo-experience-title">
        <div className="auth-page__intro">
          <p>기억새록 데모</p>
          <h1 id="demo-experience-title">어떻게 체험해 볼까요?</h1>
        </div>

        <div className="auth-page__experience-options" role="radiogroup" aria-label="체험 방식">
          {EXPERIENCE_OPTIONS.map((option) => {
            const isSelected = experienceMode === option.id;

            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={isSelected ? "is-selected" : ""}
                onClick={() => setExperienceMode(option.id)}
              >
                <span className="auth-page__experience-indicator" aria-hidden="true" />
                <span>
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>
              </button>
            );
          })}
        </div>

        {errorMessage && (
          <p className="auth-page__error" role="alert">
            {errorMessage}
          </p>
        )}

        <button
          className="auth-page__submit"
          disabled={isStarting}
          type="button"
          onClick={handleStartDemo}
        >
          {isStarting ? "데모를 준비하고 있어요" : "데모 체험 시작하기"}
        </button>
      </section>
    </main>
  );
}
