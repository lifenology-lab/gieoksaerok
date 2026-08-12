import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  deleteMealRecordSceneImage,
  deleteMealRecord,
  fetchMealRecords,
} from "@/features/meal-recognition/api/mealRecognitionApi";
import { getApiMediaUrl } from "@/shared/api/client";

import "./MealRecordsPage.css";

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

function formatMealDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "기록 시간 정보 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function MealRecordsPage() {
  const navigate = useNavigate();
  const [mealRecords, setMealRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  const [selectedMealRecord, setSelectedMealRecord] = useState(null);
  const [isDeletingSceneImage, setIsDeletingSceneImage] = useState(false);
  const [isDeleteRecordConfirmOpen, setIsDeleteRecordConfirmOpen] = useState(false);
  const [isDeletingMealRecord, setIsDeletingMealRecord] = useState(false);
  const [sceneImageError, setSceneImageError] = useState("");

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentDateTime(new Date());
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const handleDeleteSceneImage = async () => {
    if (!selectedMealRecord || isDeletingSceneImage) {
      return;
    }

    try {
      setIsDeletingSceneImage(true);
      setSceneImageError("");
      const updatedMealRecord = await deleteMealRecordSceneImage(
        selectedMealRecord.id,
      );

      setMealRecords((records) =>
        records.map((record) =>
          record.id === updatedMealRecord.id ? updatedMealRecord : record,
        ),
      );
      setSelectedMealRecord(null);
    } catch {
      setSceneImageError("사진을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsDeletingSceneImage(false);
    }
  };

  const handleDeleteMealRecord = async () => {
    if (!selectedMealRecord || isDeletingMealRecord) {
      return;
    }

    try {
      setIsDeletingMealRecord(true);
      setSceneImageError("");
      await deleteMealRecord(selectedMealRecord.id);
      setMealRecords((records) =>
        records.filter((record) => record.id !== selectedMealRecord.id),
      );
      setIsDeleteRecordConfirmOpen(false);
      setSelectedMealRecord(null);
    } catch {
      setSceneImageError("식사 기록을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsDeletingMealRecord(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadMealRecords = async () => {
      try {
        const records = await fetchMealRecords();

        if (isMounted) {
          setMealRecords(records);
        }
      } catch {
        if (isMounted) {
          setErrorMessage(
            "식사 기록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadMealRecords();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="meal-records-page">
      <div className="meal-records-page__background" aria-hidden="true" />

      <section className="meal-records-page__date-time" aria-live="polite">
        <p>{formatDate(currentDateTime)}</p>
        <strong>{formatTime(currentDateTime)}</strong>
        <span aria-hidden="true" />
      </section>

      <section className="meal-records-page__intro">
        <span aria-hidden="true" />
        <div>
          <h1>식사 기록</h1>
          <p>남긴 식사를 함께 확인해볼까요?</p>
        </div>
      </section>

      <section className="meal-records-page__content" aria-live="polite">
        {isLoading && (
          <p className="meal-records-page__notice">기록을 불러오고 있어요.</p>
        )}

        {!isLoading && errorMessage && (
          <p className="meal-records-page__notice is-error">{errorMessage}</p>
        )}

        {!isLoading && !errorMessage && mealRecords.length === 0 && (
          <p className="meal-records-page__notice">
            아직 남긴 식사 기록이 없어요.
          </p>
        )}

        {!isLoading && !errorMessage && mealRecords.length > 0 && (
          <ul className="meal-records-page__list">
            {mealRecords.map((mealRecord) => (
              <li key={mealRecord.id}>
                {mealRecord.sceneImage && (
                  <button
                    type="button"
                    className="meal-records-page__scene-image-button"
                    onClick={() => {
                      setSelectedMealRecord(mealRecord);
                      setSceneImageError("");
                    }}
                    aria-label={`${mealRecord.mealLabel} 식사 사진 크게 보기`}
                  >
                  <img
                    className="meal-records-page__scene-image"
                    src={getApiMediaUrl(mealRecord.sceneImage)}
                    alt={`${mealRecord.mealLabel} 식사 사진`}
                  />
                  </button>
                )}
                <div className="meal-records-page__record-details">
                  <strong>{mealRecord.mealLabel}</strong>
                  <time dateTime={mealRecord.eatenAt}>
                    {formatMealDateTime(mealRecord.eatenAt)}
                  </time>
                  {mealRecord.menu && <p>{mealRecord.menu}</p>}
                  {mealRecord.memo && <p>{mealRecord.memo}</p>}
                  <button
                    type="button"
                    className="meal-records-page__delete-record-button"
                    onClick={() => {
                      setSelectedMealRecord(mealRecord);
                      setIsDeleteRecordConfirmOpen(true);
                      setSceneImageError("");
                    }}
                  >
                    이 식사 기록이 맞지 않아요
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selectedMealRecord?.sceneImage && !isDeleteRecordConfirmOpen && (
        <section className="meal-records-page__scene-image-dialog" role="dialog" aria-modal="true" aria-labelledby="meal-scene-image-title">
          <div className="meal-records-page__scene-image-dialog-card">
            <button
              type="button"
              className="meal-records-page__scene-image-close"
              aria-label="식사 사진 닫기"
              onClick={() => setSelectedMealRecord(null)}
              disabled={isDeletingSceneImage || isDeletingMealRecord}
            >
              ×
            </button>
            <h2 id="meal-scene-image-title">식사 사진</h2>
            <img
              src={getApiMediaUrl(selectedMealRecord.sceneImage)}
              alt={`${selectedMealRecord.mealLabel} 식사 사진`}
            />
            <p>사진만 삭제되고 식사 기록은 그대로 남아요.</p>
            {sceneImageError && <p className="meal-records-page__scene-image-error" role="alert">{sceneImageError}</p>}
            <div className="meal-records-page__scene-image-actions">
              <button type="button" onClick={() => setSelectedMealRecord(null)} disabled={isDeletingSceneImage || isDeletingMealRecord}>
                닫기
              </button>
              <button type="button" onClick={handleDeleteSceneImage} disabled={isDeletingSceneImage || isDeletingMealRecord}>
                {isDeletingSceneImage ? "삭제 중" : "사진 삭제"}
              </button>
            </div>
          </div>
        </section>
      )}

      {selectedMealRecord && isDeleteRecordConfirmOpen && (
        <section className="meal-records-page__delete-record-overlay" role="alertdialog" aria-modal="true" aria-labelledby="meal-record-delete-title">
          <div className="meal-records-page__delete-record-confirm">
            <h3 id="meal-record-delete-title">이 식사 기록이 맞지 않나요?</h3>
            <section className="meal-records-page__delete-record-summary">
              {selectedMealRecord.sceneImage && (
                <img
                  src={getApiMediaUrl(selectedMealRecord.sceneImage)}
                  alt={`${selectedMealRecord.mealLabel} 식사 당시 사진`}
                />
              )}
              <div>
                <strong>{selectedMealRecord.mealLabel}</strong>
                <time dateTime={selectedMealRecord.eatenAt}>
                  {formatMealDateTime(selectedMealRecord.eatenAt)}
                </time>
                {selectedMealRecord.menu && <p>{selectedMealRecord.menu}</p>}
                {selectedMealRecord.memo && <p>{selectedMealRecord.memo}</p>}
              </div>
            </section>
            <p className="meal-records-page__delete-record-warning">
              식사 기록과 사진이 모두 삭제돼요.
            </p>
            {sceneImageError && <p className="meal-records-page__scene-image-error" role="alert">{sceneImageError}</p>}
            <div>
              <button
                type="button"
                onClick={() => {
                  setIsDeleteRecordConfirmOpen(false);
                  setSelectedMealRecord(null);
                }}
                disabled={isDeletingMealRecord}
              >
                그대로 둘게요
              </button>
              <button type="button" onClick={handleDeleteMealRecord} disabled={isDeletingMealRecord}>
                {isDeletingMealRecord ? "삭제 중" : "기록 삭제"}
              </button>
            </div>
          </div>
        </section>
      )}

      <nav className="meal-records-page__navigation" aria-label="페이지 이동">
        <button type="button" onClick={() => navigate("/patient/daily")}>
          일상 모드로 돌아가기
        </button>
        <button type="button" onClick={() => navigate("/patient")}>
          홈으로 돌아가기
        </button>
      </nav>
    </main>
  );
}
