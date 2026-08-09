import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAccessToken,
  getRefreshToken,
  clearAuthTokens,
} from "@/shared/api/authTokens";
import { request } from "@/shared/api/client";
import { isStandalonePwa } from "@/shared/pwa/isStandalonePwa";
import { promptPwaInstall } from "@/shared/pwa/installPrompt";
import "./LandingPage.css";

export default function LandingPage() {
  const navigate = useNavigate();
  const isPwa = isStandalonePwa();

  const [authCheckStatus, setAuthCheckStatus] = useState("idle");
  const [authCheckMessage, setAuthCheckMessage] = useState("");

  const handleInstallClick = async () => {
    if (isStandalonePwa()) {
      navigate(getAccessToken() ? "/roles" : "/auth");
      return;
    }

    try {
      const result = await promptPwaInstall();

      if (!result.prompted || result.outcome !== "accepted") {
        navigate("/install");
      }
    } catch {
      navigate("/install");
    }
  };

  useEffect(() => {
    if (!isPwa) return;

    const accessToken = getAccessToken();
    const refreshToken = getRefreshToken();
    const hasToken = Boolean(accessToken || refreshToken);

    if (!hasToken) {
      navigate("/auth", { replace: true });
      return;
    }

    let isMounted = true;

    async function checkAuth() {
      setAuthCheckStatus("checking");
      setAuthCheckMessage("");

      try {
        await request("/api/auth/me/");

        if (isMounted) {
          navigate("/roles", { replace: true });
        }
      } catch {
        clearAuthTokens();

        if (isMounted) {
          setAuthCheckStatus("error");
          setAuthCheckMessage(
            "로그인 상태를 확인하지 못했어요. 네트워크 연결을 확인해 주세요.",
          );
        }
      }
    }

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [isPwa, navigate]);

  if (isPwa) {
    return (
      <main className="landing-page">
        <section className="landing-hero">
          {authCheckStatus === "checking" && (
            <>
              <h1 className="landing-title">기억새록을 준비하고 있어요</h1>
              <p className="landing-description">
                로그인 상태를 확인하는 중입니다.
              </p>
            </>
          )}

          {authCheckStatus === "error" && (
            <>
              <h1 className="landing-title">앱을 불러오지 못했어요</h1>
              <p className="landing-description">{authCheckMessage}</p>

              <div className="landing-actions">
                <button
                  type="button"
                  className="landing-primary-button"
                  onClick={() => navigate("/auth", { replace: true })}
                >
                  다시 로그인하기
                </button>

                <button
                  type="button"
                  className="landing-secondary-button"
                  onClick={() => window.location.reload()}
                >
                  다시 시도하기
                </button>
              </div>
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <p className="landing-eyebrow">AR 글래스 기반 기억 보조 체험</p>

        <h1 id="landing-title" className="landing-title">
          기억새록
        </h1>

        <p className="landing-description">
          기억새록은 기억과 맥락을 복원하는 일상 보조 서비스 체험판입니다.
          모바일 PWA를 통해 환자와 보호자가 각각 어떤 화면을 경험하게 되는지
          확인할 수 있습니다.
        </p>

        <p className="landing-note">
          온라인 체험에서는 하나의 계정으로 환자 화면과 보호자 화면을 모두
          확인할 수 있습니다.
        </p>

        <div className="landing-actions">
          <button
            type="button"
            className="landing-primary-button"
            onClick={handleInstallClick}
          >
            앱 다운로드하기
          </button>

          <button
            type="button"
            className="landing-secondary-button"
            onClick={() => navigate("/auth")}
          >
            로그인하고 체험하기
          </button>
        </div>
      </section>
    </main>
  );
}
