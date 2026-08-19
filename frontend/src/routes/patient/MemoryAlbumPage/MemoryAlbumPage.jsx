import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  DAILY_MODE_RECOGNITION_TYPES,
  DAILY_MODE_RETURN_RECOGNITION_KEY,
} from "../../../features/daily-mode/constants/returnRecognition";
import {
  createMemoryAlbumItem,
  deleteMemoryAlbumItem,
  fetchMemoryAlbumItems,
  getMemoryAlbumPhotoUrl,
} from "../../../features/memory-album/api/memoryAlbumApi";

import "./MemoryAlbumPage.css";

const DESCRIPTION_MAX_LENGTH = 160;
const DEFAULT_CROP_POSITION = { x: 50, y: 50 };
const ALBUM_ITEMS_PER_PAGE = 2;

function clampCropValue(value) {
  return Math.min(Math.max(value, 0), 100);
}

function getCropStyle({ crop_x: cropX, crop_y: cropY }) {
  return {
    objectPosition: `${cropX ?? DEFAULT_CROP_POSITION.x}% ${
      cropY ?? DEFAULT_CROP_POSITION.y
    }%`,
  };
}

function getPersonLabel(person, personId) {
  if (person?.name && person?.relationship) {
    return `${person.relationship} ${person.name}`;
  }

  if (person?.name) {
    return person.name;
  }

  return personId ? "인식된 인물" : "인물";
}

export default function MemoryAlbumPage() {
  const nav = useNavigate();
  const location = useLocation();
  const { personId } = useParams();
  const cropDragRef = useRef(null);
  const person = location.state?.person || null;
  const personLabel = getPersonLabel(person, personId);
  const [albumItems, setAlbumItems] = useState([]);
  const [albumPageIndex, setAlbumPageIndex] = useState(0);
  const [deletingItemId, setDeletingItemId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [cropPosition, setCropPosition] = useState(DEFAULT_CROP_POSITION);
  const [isCropDragging, setIsCropDragging] = useState(false);
  const [description, setDescription] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [formMessage, setFormMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadAlbumItems() {
      if (!personId) {
        setErrorMessage("인물 정보를 찾지 못했어요.");
        setIsLoading(false);
        return;
      }

      try {
        setErrorMessage("");
        const items = await fetchMemoryAlbumItems(personId);

        if (isMounted) {
          setAlbumItems(items);
          setAlbumPageIndex(0);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error.message || "추억 앨범을 불러오지 못했어요.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadAlbumItems();

    return () => {
      isMounted = false;
    };
  }, [personId]);

  useEffect(() => {
    if (!photoFile) {
      setPreviewUrl("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(photoFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [photoFile]);

  useEffect(() => {
    const lastPageIndex = Math.max(
      Math.ceil(albumItems.length / ALBUM_ITEMS_PER_PAGE) - 1,
      0,
    );

    if (albumPageIndex > lastPageIndex) {
      setAlbumPageIndex(lastPageIndex);
    }
  }, [albumItems.length, albumPageIndex]);

  const albumPageCount = Math.ceil(albumItems.length / ALBUM_ITEMS_PER_PAGE);
  const visibleAlbumItems = albumItems.slice(
    albumPageIndex * ALBUM_ITEMS_PER_PAGE,
    albumPageIndex * ALBUM_ITEMS_PER_PAGE + ALBUM_ITEMS_PER_PAGE,
  );
  const shouldShowAlbumArrow = albumItems.length > ALBUM_ITEMS_PER_PAGE;

  const resetForm = () => {
    setPhotoFile(null);
    setPreviewUrl("");
    setCropPosition(DEFAULT_CROP_POSITION);
    setIsCropDragging(false);
    cropDragRef.current = null;
    setDescription("");
    setFormMessage("");
  };

  const handleToggleForm = () => {
    setIsFormOpen((currentValue) => {
      if (currentValue) {
        resetForm();
      }

      return !currentValue;
    });
  };

  const handlePhotoChange = (event) => {
    setPhotoFile(event.target.files?.[0] || null);
    setCropPosition(DEFAULT_CROP_POSITION);
    setFormMessage("");
  };

  const handleDescriptionChange = (event) => {
    setDescription(event.target.value);
    setFormMessage("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!photoFile) {
      setFormMessage("등록할 사진을 선택해주세요.");
      return;
    }

    if (!description.trim()) {
      setFormMessage("사진 아래에 적을 짧은 설명을 입력해주세요.");
      return;
    }

    try {
      setIsSaving(true);
      setFormMessage("");
      const createdItem = await createMemoryAlbumItem({
        personId,
        photo: photoFile,
        description: description.trim(),
        cropX: cropPosition.x,
        cropY: cropPosition.y,
      });

      setAlbumItems((currentItems) => [createdItem, ...currentItems]);
      setAlbumPageIndex(0);
      resetForm();
      setIsFormOpen(false);
    } catch (error) {
      setFormMessage(error.message || "추억을 등록하지 못했어요.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCropPointerDown = (event) => {
    if (!previewUrl) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    cropDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCropX: cropPosition.x,
      startCropY: cropPosition.y,
    };
    setIsCropDragging(true);
  };

  const handleCropPointerMove = (event) => {
    const cropDrag = cropDragRef.current;

    if (!cropDrag || cropDrag.pointerId !== event.pointerId) {
      return;
    }

    const frame = event.currentTarget.getBoundingClientRect();
    const deltaX = event.clientX - cropDrag.startClientX;
    const deltaY = event.clientY - cropDrag.startClientY;
    const nextX = cropDrag.startCropX - (deltaX / frame.width) * 100;
    const nextY = cropDrag.startCropY - (deltaY / frame.height) * 100;

    setCropPosition({
      x: clampCropValue(nextX),
      y: clampCropValue(nextY),
    });
  };

  const handleCropPointerEnd = (event) => {
    const cropDrag = cropDragRef.current;

    if (cropDrag?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      cropDragRef.current = null;
      setIsCropDragging(false);
    }
  };

  const handleNextAlbumPage = () => {
    setAlbumPageIndex((currentPageIndex) => {
      const nextPageIndex = currentPageIndex + 1;

      if (nextPageIndex >= albumPageCount) {
        return 0;
      }

      return nextPageIndex;
    });
  };

  const handlePreviousAlbumPage = () => {
    setAlbumPageIndex((currentPageIndex) => {
      const previousPageIndex = currentPageIndex - 1;

      if (previousPageIndex < 0) {
        return albumPageCount - 1;
      }

      return previousPageIndex;
    });
  };

  const handleDeleteAlbumItem = async (item) => {
    const shouldDelete = window.confirm(
      "이 추억 카드를 삭제할까요? 삭제하면 되돌릴 수 없습니다.",
    );

    if (!shouldDelete) {
      return;
    }

    try {
      setDeletingItemId(item.id);
      await deleteMemoryAlbumItem({
        personId,
        itemId: item.id,
      });
      setAlbumItems((currentItems) =>
        currentItems.filter((currentItem) => currentItem.id !== item.id),
      );
    } catch (error) {
      setErrorMessage(error.message || "추억 카드를 삭제하지 못했어요.");
    } finally {
      setDeletingItemId("");
    }
  };

  const handleReturnToPersonRecognition = () => {
    window.sessionStorage.setItem(
      DAILY_MODE_RETURN_RECOGNITION_KEY,
      DAILY_MODE_RECOGNITION_TYPES.PERSON,
    );
    nav("/patient/daily");
  };

  return (
    <main className="memory-album-page">
      <header className="memory-album-page__header">
        <div>
          <p>{personLabel}</p>
          <h1>추억 카드</h1>
        </div>

        <div className="memory-album-page__header-actions">
          <button
            className="memory-album-page__back-button"
            type="button"
            onClick={() => nav(-1)}
          >
            이전으로 돌아가기
          </button>
          <button
            className="memory-album-page__register-button"
            type="button"
            onClick={handleToggleForm}
          >
            {isFormOpen ? "등록 닫기" : "추억 등록"}
          </button>
        </div>
      </header>

      {isFormOpen && (
        <form className="memory-album-page__form" onSubmit={handleSubmit}>
          <div className="memory-album-page__photo-column">
            <label className="memory-album-page__photo-picker">
              <span>{previewUrl ? "사진 변경" : "사진 선택"}</span>
              <input type="file" accept="image/*" onChange={handlePhotoChange} />
            </label>

            {previewUrl && (
              <div className="memory-album-page__crop-control">
                <span>사진 위치</span>
                <div
                  className={`memory-album-page__crop-frame ${
                    isCropDragging
                      ? "memory-album-page__crop-frame--dragging"
                      : ""
                  }`}
                  aria-label="사진 위치 조정"
                  role="img"
                  onPointerDown={handleCropPointerDown}
                  onPointerMove={handleCropPointerMove}
                  onPointerUp={handleCropPointerEnd}
                  onPointerCancel={handleCropPointerEnd}
                >
                  <img
                    src={previewUrl}
                    alt="등록할 추억 미리보기"
                    draggable="false"
                    style={{
                      objectPosition: `${cropPosition.x}% ${cropPosition.y}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <label className="memory-album-page__description-field">
            <span>짧은 설명</span>
            <textarea
              maxLength={DESCRIPTION_MAX_LENGTH}
              placeholder={`${personLabel}님과의 추억을 짧게 적어주세요.`}
              rows="3"
              value={description}
              onChange={handleDescriptionChange}
            />
          </label>

          <div className="memory-album-page__form-footer">
            <span>
              {description.length}/{DESCRIPTION_MAX_LENGTH}
            </span>
            <button type="submit" disabled={isSaving}>
              {isSaving ? "등록 중" : "저장"}
            </button>
          </div>

          {formMessage && (
            <p className="memory-album-page__form-message">{formMessage}</p>
          )}
        </form>
      )}

      <section className="memory-album-page__album" aria-live="polite">
        {isLoading && (
          <p className="memory-album-page__state">추억을 불러오는 중입니다.</p>
        )}

        {!isLoading && errorMessage && (
          <p className="memory-album-page__state">{errorMessage}</p>
        )}

        {!isLoading && !errorMessage && albumItems.length === 0 && (
          <div className="memory-album-page__empty">
            <h2>아직 등록된 추억이 없습니다.</h2>
            <p>오른쪽 위의 추억 등록 버튼으로 첫 사진을 추가해보세요.</p>
          </div>
        )}

        {!isLoading && !errorMessage && albumItems.length > 0 && (
          <div
            className={`memory-album-page__album-window ${
              shouldShowAlbumArrow
                ? "memory-album-page__album-window--with-arrows"
                : ""
            }`}
          >
            {shouldShowAlbumArrow && (
              <button
                className="memory-album-page__arrow-button memory-album-page__arrow-button--previous"
                type="button"
                aria-label="이전 추억 카드 보기"
                onClick={handlePreviousAlbumPage}
              >
                ‹
              </button>
            )}

            <div
              className={`memory-album-page__grid ${
                visibleAlbumItems.length === 1
                  ? "memory-album-page__grid--single"
                  : ""
              }`}
            >
              {visibleAlbumItems.map((item) => (
                <article className="memory-album-page__polaroid" key={item.id}>
                  <button
                    className="memory-album-page__delete-button"
                    type="button"
                    aria-label="추억 카드 삭제"
                    disabled={deletingItemId === item.id}
                    onClick={() => handleDeleteAlbumItem(item)}
                  >
                    ×
                  </button>
                  <div className="memory-album-page__photo-frame">
                    <img
                      src={getMemoryAlbumPhotoUrl(item.photo_url)}
                      alt={item.description}
                      loading="lazy"
                      style={getCropStyle(item)}
                    />
                  </div>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>

            {shouldShowAlbumArrow && (
              <button
                className="memory-album-page__arrow-button memory-album-page__arrow-button--next"
                type="button"
                aria-label="다음 추억 카드 보기"
                onClick={handleNextAlbumPage}
              >
                ›
              </button>
            )}
          </div>
        )}
      </section>

      <button
        className="memory-album-page__return-button"
        type="button"
        onClick={handleReturnToPersonRecognition}
      >
        얼굴 인식 화면으로 돌아가기
      </button>
    </main>
  );
}
