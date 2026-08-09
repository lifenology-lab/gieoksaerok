import { useEffect, useState } from "react";
import "./LandscapeGuard.css";

function getShouldShowLandscapeNotice() {
  if (typeof window === "undefined") {
    return false;
  }

  const isPortrait =
    window.matchMedia?.("(orientation: portrait)").matches ?? false;

  const isTouchDevice =
    window.navigator.maxTouchPoints > 0 ||
    window.matchMedia?.("(pointer: coarse)").matches === true;

  return isTouchDevice && isPortrait;
}

export default function LandscapeGuard({ children }) {
  const [shouldShowNotice, setShouldShowNotice] = useState(
    getShouldShowLandscapeNotice,
  );

  useEffect(() => {
    const updateOrientationState = () => {
      setShouldShowNotice(getShouldShowLandscapeNotice());
    };

    updateOrientationState();

    window.addEventListener("resize", updateOrientationState);
    window.addEventListener("orientationchange", updateOrientationState);

    return () => {
      window.removeEventListener("resize", updateOrientationState);
      window.removeEventListener("orientationchange", updateOrientationState);
    };
  }, []);

  if (shouldShowNotice) {
    return (
      <main className="landscape-guard">
        <section className="landscape-guard-card">
          <div className="landscape-guard-icon" aria-hidden="true">
            ↻
          </div>

          <h1>휴대폰을 가로로 돌려주세요</h1>

          <p>원활한 체험을 위해 기기를 가로 방향으로 전환해 주세요.</p>

          <p className="landscape-guard-subtext">
            기억새록의 환자·보호자 체험 화면은 AR 글래스 사용 상황을 가정해 가로
            화면에 최적화되어 있습니다.
          </p>
        </section>
      </main>
    );
  }

  return children;
}
