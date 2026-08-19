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
      <header className="demo-scenes-page__header">
        <div>
          <p>기억새록 데모</p>
          <h1>예시 장면으로 체험해 볼까요?</h1>
          <span>노트북에서는 준비된 기록과 추억을 편하게 살펴볼 수 있어요.</span>
        </div>
        <button type="button" onClick={() => navigate("/roles")}>
          모드 선택
        </button>
      </header>

      <section className="demo-scenes-page__content" aria-label="예시 장면">
        {isLoading && <p className="demo-scenes-page__loading">예시 장면을 준비하고 있어요.</p>}

        {!isLoading && (
          <div className="demo-scenes-page__cards">
            <article className="demo-scenes-page__card">
              {mealImageUrl ? (
                <img src={mealImageUrl} alt="준비된 식사 장면" />
              ) : (
                <div className="demo-scenes-page__image-placeholder" aria-hidden="true">식사</div>
              )}
              <div>
                <p>예시 식사 장면</p>
                <h2>준비된 식사 기록을 살펴보세요</h2>
                <button type="button" onClick={() => navigate("/patient/meal-records")}>
                  식사 기록 보기
                </button>
              </div>
            </article>

            <article className="demo-scenes-page__card">
              {memoryImageUrl ? (
                <img src={memoryImageUrl} alt={`${getPersonLabel(person)} 추억 사진`} />
              ) : (
                <div className="demo-scenes-page__image-placeholder" aria-hidden="true">추억</div>
              )}
              <div>
                <p>예시 인물·추억 장면</p>
                <h2>{getPersonLabel(person)}과의 추억을 살펴보세요</h2>
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
