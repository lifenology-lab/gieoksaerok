import { Link } from "react-router-dom";

import { useAuth } from "../../features/auth/context/authContextValue";
import {
  DEMO_EXPERIENCE_MODES,
  setDemoExperienceMode,
} from "../../shared/demo/demoExperienceMode";

import "./RoleSelectPage.css";

const RoleSelectPage = () => {
  const { signOut, user } = useAuth();

  return (
    <main className="role-select-page">
      <header className="role-select-page__header">
        <div>
          <p>기억새록</p>
          <h1>어떤 모드로 시작할까요?</h1>
        </div>
        <button type="button" onClick={signOut}>
          로그아웃
        </button>
      </header>

      <section className="role-select-page__content">
        <p className="role-select-page__welcome">
          {user?.name || user?.username}님, 오늘도 안전하게 도와드릴게요.
        </p>

        <div className="role-select-page__actions">
          <Link
            to="/patient/daily"
            onClick={() =>
              setDemoExperienceMode(DEMO_EXPERIENCE_MODES.REAR_CAMERA)
            }
          >
            <strong>환자 모드</strong>
            <span>후면 카메라</span>
          </Link>
          <Link
            to="/patient/demo-scenes"
            onClick={() =>
              setDemoExperienceMode(DEMO_EXPERIENCE_MODES.EXAMPLE_SCENES)
            }
          >
            <strong>환자 모드</strong>
            <span>예시 장면</span>
          </Link>
          <Link to="/caregiver">
            <strong>보호자 모드</strong>
          </Link>
        </div>
      </section>
    </main>
  );
};

export default RoleSelectPage;
