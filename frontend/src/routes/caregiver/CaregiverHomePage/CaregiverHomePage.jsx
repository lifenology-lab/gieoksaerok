import { Link } from "react-router-dom";

import "./CaregiverHomePage.css";

function ReportIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 4.8h14v14.4H5z" />
      <path d="M8.2 15.2V11" />
      <path d="M12 15.2V8.4" />
      <path d="M15.8 15.2v-5.1" />
      <path d="M8.2 18h7.6" />
    </svg>
  );
}

function MemoryIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M6.2 6.1h11.6a1.8 1.8 0 0 1 1.8 1.8v8.2a1.8 1.8 0 0 1-1.8 1.8H6.2a1.8 1.8 0 0 1-1.8-1.8V7.9a1.8 1.8 0 0 1 1.8-1.8Z" />
      <path d="m4.8 15.5 3.7-3.2 2.4 2.1 3.1-3.1 5.2 4.5" />
      <path d="M15.8 9.5h.01" />
    </svg>
  );
}

const CAREGIVER_ACTIONS = [
  {
    to: "/caregiver/weekly-report",
    title: "주간 리포트",
    description: "한 주간의 혼동 기록을 확인해요",
    icon: <ReportIcon />,
    tone: "report",
  },
  {
    to: "/caregiver/memories/new",
    title: "추억 등록",
    description: "환자에게 보여줄 추억을 추가해요",
    icon: <MemoryIcon />,
    tone: "memory",
  },
];

const CaregiverHomePage = () => {
  return (
    <main className="caregiver-home-page">
      <div className="caregiver-home-page__background" aria-hidden="true" />

      <header className="caregiver-home-page__header">
        <div>
          <p>보호자 모드</p>
          <h1>무엇을 확인할까요?</h1>
        </div>
      </header>

      <Link className="caregiver-home-page__back-button page-back-button" to="/roles">
        돌아가기
      </Link>

      <section
        className="caregiver-home-page__actions"
        aria-label="보호자 홈 메뉴"
      >
        {CAREGIVER_ACTIONS.map((action) => (
          <Link
            className="caregiver-home-page__card"
            data-tone={action.tone}
            key={action.to}
            to={action.to}
          >
            <span className="caregiver-home-page__card-icon">
              {action.icon}
            </span>
            <strong>{action.title}</strong>
            <span>{action.description}</span>
          </Link>
        ))}
      </section>
    </main>
  );
};

export default CaregiverHomePage;
