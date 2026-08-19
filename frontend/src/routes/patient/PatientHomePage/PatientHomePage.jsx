import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  DEMO_EXPERIENCE_MODES,
  setDemoExperienceMode,
} from "@/shared/demo/demoExperienceMode";

import "./PatientHomePage.css";

const WEEKDAY_LABELS = [
  "일요일",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일",
];

function formatDate(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAY_LABELS[date.getDay()]})`;
}

function formatTime(date) {
  const hours = date.getHours();
  const period = hours < 12 ? "오전" : "오후";
  const displayHours = hours % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${period} ${String(displayHours).padStart(2, "0")}:${minutes}`;
}

function HomeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 11.2 12 4l8 7.2" />
      <path d="M6.5 10.4V20h11v-9.6" />
      <path d="M9.5 20v-5.8h5V20" />
    </svg>
  );
}

function MemoryIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5.2 5.4A2.4 2.4 0 0 1 7.6 3h8.8a2.4 2.4 0 0 1 2.4 2.4v13.2a2.4 2.4 0 0 1-2.4 2.4H7.6a2.4 2.4 0 0 1-2.4-2.4Z" />
      <path d="M8.5 8.2h7M8.5 12h7M8.5 15.8h4.2" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4.5 8.2h3l1.2-2h6.6l1.2 2h3a1.8 1.8 0 0 1 1.8 1.8v7.8a1.8 1.8 0 0 1-1.8 1.8H4.5A1.8 1.8 0 0 1 2.7 17.8V10A1.8 1.8 0 0 1 4.5 8.2Z" />
      <circle cx="12" cy="13.8" r="3.2" />
    </svg>
  );
}

const ACTION_CARDS = [
  {
    to: "/patient/daily",
    title: "카메라로 체험하기",
    description: "후면 카메라를 권장해요",
    icon: <CameraIcon />,
    tone: "daily",
    demoMode: DEMO_EXPERIENCE_MODES.REAR_CAMERA,
  },
  {
    to: "/patient/demo-scenes",
    title: "예시 장면으로 체험하기",
    description: "준비된 장면을 인식해 봐요",
    icon: <HomeIcon />,
    tone: "daily",
    demoMode: DEMO_EXPERIENCE_MODES.EXAMPLE_SCENES,
  },
  {
    to: "/patient/memories",
    title: "기억 살펴보기",
    description: "오늘의 기록과 추억을 함께 봐요",
    icon: <MemoryIcon />,
    tone: "help",
  },
];

export default function PatientHomePage() {
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentDateTime(new Date());
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <main className="patient-home-page">
      <section className="patient-home-page__date-time" aria-live="polite">
        <p>{formatDate(currentDateTime)}</p>
        <strong>{formatTime(currentDateTime)}</strong>
        <span aria-hidden="true" />
      </section>

      <Link className="patient-home-page__collapse-button page-back-button" to="/roles">
        <span>돌아가기</span>
      </Link>

      <section className="patient-home-page__intro">
        <span aria-hidden="true" />
        <div>
          <h1>안녕하세요</h1>
          <p>무엇을 도와드릴까요?</p>
        </div>
      </section>

      <section className="patient-home-page__actions" aria-label="환자 홈 메뉴">
        {ACTION_CARDS.map((card) => (
          <Link
            className="patient-home-page__card"
            data-tone={card.tone}
            key={card.to}
            to={card.to}
            onClick={() => card.demoMode && setDemoExperienceMode(card.demoMode)}
          >
            <span className="patient-home-page__card-icon">{card.icon}</span>
            <strong>{card.title}</strong>
            <span>{card.description}</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
