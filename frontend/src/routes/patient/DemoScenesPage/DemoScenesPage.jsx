import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchPeople } from "@/features/face-recognition/api/peopleApi";
import { fetchMealRecords } from "@/features/meal-recognition/api/mealRecognitionApi";
import {
  fetchMemoryAlbumItems,
  getMemoryAlbumPhotoUrl,
} from "@/features/memory-album/api/memoryAlbumApi";
import { getApiMediaUrl } from "@/shared/api/client";

import "./DemoScenesPage.css";

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

function getPersonLabel(person) {
  if (!person) {
    return "가족 추억";
  }

  return person.relationship ? `${person.relationship} ${person.name}` : person.name;
}

export default function DemoScenesPage() {
  const navigate = useNavigate();
  const [mealImageUrl, setMealImageUrl] = useState("");
  const [person, setPerson] = useState(null);
  const [memoryImageUrl, setMemoryImageUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentDateTime(new Date());
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadDemoScenes() {
      try {
        const [mealRecords, people] = await Promise.all([
          fetchMealRecords(),
          fetchPeople(),
        ]);
        const mealWithImage = mealRecords.find((record) => record.sceneImage);
        const selectedPerson = people[0] || null;

        if (!isMounted) {
          return;
        }

        setMealImageUrl(getApiMediaUrl(mealWithImage?.sceneImage));
        setPerson(selectedPerson);

        if (selectedPerson?.id) {
          const albumItems = await fetchMemoryAlbumItems(selectedPerson.id);

          if (isMounted) {
            setMemoryImageUrl(getMemoryAlbumPhotoUrl(albumItems[0]?.photo_url));
          }
        }
      } catch {
        // 사진을 불러오지 못해도 각 기록 화면으로 이동하는 체험은 제공한다.
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadDemoScenes();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="demo-scenes-page">
      <div className="demo-scenes-page__background" aria-hidden="true" />

      <header className="demo-scenes-page__header">
        <section className="demo-scenes-page__date-time" aria-live="polite">
          <p>{formatDate(currentDateTime)}</p>
          <strong>{formatTime(currentDateTime)}</strong>
          <span aria-hidden="true" />
        </section>
        <button
          className="demo-scenes-page__collapse-button"
          type="button"
          onClick={() => navigate("/roles")}
        >
          돌아가기
        </button>
      </header>

      <section className="demo-scenes-page__intro">
        <span aria-hidden="true" />
        <div>
          <h1>예시 장면으로 체험해 볼까요?</h1>
          <p>준비된 식사 기록과 가족의 추억을 살펴볼 수 있어요.</p>
        </div>
      </section>

      <section className="demo-scenes-page__content" aria-label="예시 장면">
        {isLoading && <p className="demo-scenes-page__loading">예시 장면을 준비하고 있어요.</p>}

        {!isLoading && (
          <div className="demo-scenes-page__cards">
            <article className="demo-scenes-page__card">
              {mealImageUrl ? (
                <img src={mealImageUrl} alt="준비된 식사 장면" />
              ) : (
                <div className="demo-scenes-page__image-placeholder" aria-hidden="true">식사 기록</div>
              )}
              <div>
                <h2>식사 기록</h2>
                <p>준비된 식사 장면을 살펴보세요.</p>
                <button type="button" onClick={() => navigate("/patient/meal-records")}>
                  식사 기록 보기
                </button>
              </div>
            </article>

            <article className="demo-scenes-page__card">
              {memoryImageUrl ? (
                <img src={memoryImageUrl} alt={`${getPersonLabel(person)} 추억 사진`} />
              ) : (
                <div className="demo-scenes-page__image-placeholder" aria-hidden="true">가족 추억</div>
              )}
              <div>
                <h2>{getPersonLabel(person)}</h2>
                <p>가족과의 추억을 함께 살펴보세요.</p>
                <button
                  type="button"
                  disabled={!person?.id}
                  onClick={() =>
                    navigate(`/patient/memory-album/${person.id}`, {
                      state: { person },
                    })
                  }
                >
                  추억 살펴보기
                </button>
              </div>
            </article>
          </div>
        )}

        <button
          className="demo-scenes-page__camera-action"
          type="button"
          onClick={() => navigate("/patient/daily")}
        >
          카메라로 직접 체험하기
        </button>
      </section>
    </main>
  );
}
