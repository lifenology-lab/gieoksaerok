import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { fetchDemoExperienceSession } from "../../features/auth/api/authApi";
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

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { beginDemoExperience, isAuthenticated, isCheckingSession } = useAuth();
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [existingSession, setExistingSession] = useState(null);
  const [isSessionChecking, setIsSessionChecking] = useState(true);
  const [isStartingNewExperience, setIsStartingNewExperience] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (isCheckingSession) {
      return undefined;
    }

    if (!isAuthenticated) {
      setExistingSession(null);
      setIsSessionChecking(false);
      return undefined;
    }

    setIsSessionChecking(true);

    fetchDemoExperienceSession()
      .then(({ session }) => {
        if (isMounted) {
          setExistingSession(session);
        }
      })
      .catch(() => {
        if (isMounted) {
          setExistingSession(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsSessionChecking(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, isCheckingSession]);

  const handleStartDemo = async () => {
    try {
      setIsStarting(true);
      setErrorMessage("");
      await beginDemoExperience({ mode: DEMO_EXPERIENCE_MODES.REAR_CAMERA });
      setDemoExperienceMode(DEMO_EXPERIENCE_MODES.REAR_CAMERA);
      navigate(getRedirectPath(location), { replace: true });
    } catch (error) {
      setErrorMessage(error?.message || "데모 체험을 시작하지 못했어요.");
    } finally {
      setIsStarting(false);
    }
  };

  const handleContinueDemo = () => {
    setDemoExperienceMode(existingSession.mode);
    navigate(getRedirectPath(location), { replace: true });
  };

  if (isCheckingSession || isSessionChecking) {
    return (
      <main className="auth-page">
        <section className="auth-page__panel auth-page__panel--status">
          <div className="auth-page__intro">
            <p>기억새록 데모</p>
            <h1>이전 체험 기록을 확인하고 있어요</h1>
          </div>
        </section>
      </main>
    );
  }

  if (existingSession && !isStartingNewExperience) {
    return (
      <main className="auth-page">
        <section className="auth-page__panel" aria-labelledby="resume-demo-title">
          <div className="auth-page__intro">
            <p>기억새록 데모</p>
            <h1 id="resume-demo-title">이전 체험 기록이 있어요</h1>
          </div>

          <p className="auth-page__description">
            이 브라우저에서 만든 기록은 7일 동안 이어서 살펴볼 수 있고, 이후 자동으로 삭제돼요.
          </p>

          <button
            className="auth-page__submit"
            type="button"
            onClick={handleContinueDemo}
          >
            이전 체험 이어보기
          </button>
          <button
            className="auth-page__secondary-action"
            type="button"
            onClick={() => setIsStartingNewExperience(true)}
          >
            새 데모 체험 시작하기
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-page__panel" aria-labelledby="demo-experience-title">
        <div className="auth-page__intro">
          <p>기억새록 데모</p>
          <h1 id="demo-experience-title">
            {isStartingNewExperience
              ? "새 데모 체험을 시작해 볼까요?"
              : "데모 체험을 시작해 볼까요?"}
          </h1>
        </div>

        <p className="auth-page__description">
          {isStartingNewExperience
            ? "새 기록은 이전 체험 기록과 별도로 7일 동안 저장되며, 이후 자동으로 삭제돼요."
            : "이전 체험 기록이 없어요. 새로 체험을 시작해 주세요."}
        </p>
        <p className="auth-page__notice">
          웹 브라우저와 PWA에서는 체험 기록이 이어지지 않을 수 있어요.
        </p>

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
