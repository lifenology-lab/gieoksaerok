import { Navigate, useNavigate } from "react-router-dom";
import { getAccessToken } from "@/shared/api/authTokens";
import { isStandalonePwa } from "@/shared/pwa/isStandalonePwa";
import "./LandingPage.css";

export default function LandingPage() {
  const navigate = useNavigate();

  const isPwa = isStandalonePwa();
  const accessToken = getAccessToken();

  if (isPwa && accessToken) {
    // PWA로 접속 & 로그인 완료이므로 환자/보호자 선택 페이지
    return <Navigate to="/roles" replace />;
  }

  if (isPwa && !accessToken) {
    // PWA로 접속 & 로그인 안 되어 있으므로 로그인 페이지
    return <Navigate to="/auth" replace />;
  }

  return (
    <main className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <p className="landing-eyebrow">AR 글래스 기반 기억 보조 체험</p>

        <h1 id="landing-title" className="landing-title">
          기억새록
        </h1>

        <p className="landing-description">
          기억새록은 기억과 맥락을 복원하는 일상 보조 서비스입니다. 모바일
          웹앱을 통해 환자와 보호자가 각각 어떤 화면을 경험하게 되는지 확인할 수
          있습니다.
        </p>

        <p className="landing-note">
          온라인 체험에서는 하나의 계정으로 환자 화면과 보호자 화면을 모두
          확인할 수 있습니다.
        </p>

        <div className="landing-actions">
          <button
            type="button"
            className="landing-primary-button"
            onClick={() => navigate("/install")}
          >
            앱 다운로드하기
          </button>

          <button
            type="button"
            className="landing-secondary-button"
            onClick={() => {
              console.log("auth button clicked");
              navigate(accessToken ? "/roles" : "/auth");
            }}
          >
            로그인하고 체험하기
          </button>
        </div>
      </section>
    </main>
  );
}
