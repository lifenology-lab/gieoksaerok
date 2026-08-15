import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "@/features/auth/context/authContextValue";
import { fetchPeople } from "@/features/face-recognition/api/peopleApi";
import { createMemoryAlbumItem } from "@/features/memory-album/api/memoryAlbumApi";

import "./CaregiverMemoryRegisterPage.css";

const DESCRIPTION_MAX_LENGTH = 700;
const DEFAULT_CROP_POSITION = { x: 50, y: 50 };

function clampCropValue(value) {
  return Math.min(Math.max(value, 0), 100);
}

function getPersonLabel(person) {
  if (!person) {
    return "";
  }

  return `${person.relationship} ${person.name}`;
}

export default function CaregiverMemoryRegisterPage() {
  const { user } = useAuth();
  const cropDragRef = useRef(null);
  const fileInputRef = useRef(null);
  const [people, setPeople] = useState([]);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [cropPosition, setCropPosition] = useState(DEFAULT_CROP_POSITION);
  const [isCropDragging, setIsCropDragging] = useState(false);
  const [description, setDescription] = useState("");
  const [isLoadingPeople, setIsLoadingPeople] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const selectedPerson = useMemo(
    () => people.find((person) => person.id === selectedPersonId) || null,
    [people, selectedPersonId],
  );
  const selectedPersonLabel = getPersonLabel(selectedPerson);
  const patientName = user?.name?.trim() || user?.username?.trim() || "환자";

  useEffect(() => {
    let isMounted = true;

    async function loadPeople() {
      try {
        setIsLoadingPeople(true);
        setErrorMessage("");
        const nextPeople = await fetchPeople();

        if (isMounted) {
          setPeople(nextPeople);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error.message || "등록된 사람 목록을 불러오지 못했어요.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingPeople(false);
        }
      }
    }

    loadPeople();

    return () => {
      isMounted = false;
    };
  }, []);

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

  const resetPhotoForm = () => {
    setPhotoFile(null);
    setPreviewUrl("");
    setCropPosition(DEFAULT_CROP_POSITION);
    setIsCropDragging(false);
    cropDragRef.current = null;
    setDescription("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handlePersonChange = (event) => {
    setSelectedPersonId(event.target.value);
    setMessage("");
    setErrorMessage("");
  };

  const handlePhotoChange = (event) => {
    setPhotoFile(event.target.files?.[0] || null);
    setCropPosition(DEFAULT_CROP_POSITION);
    setMessage("");
    setErrorMessage("");
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

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!selectedPersonId) {
      setErrorMessage("추억을 등록할 사람을 선택해주세요.");
      return;
    }

    if (!photoFile) {
      setErrorMessage("등록할 사진을 선택해주세요.");
      return;
    }

    if (!description.trim()) {
      setErrorMessage("사진에 함께 적을 글귀를 입력해주세요.");
      return;
    }

    try {
      setIsSaving(true);
      setMessage("");
      setErrorMessage("");
      await createMemoryAlbumItem({
        personId: selectedPersonId,
        photo: photoFile,
        description: description.trim(),
        cropX: cropPosition.x,
        cropY: cropPosition.y,
        source: "caregiver",
      });

      resetPhotoForm();
      setMessage(
        `${selectedPersonLabel || "선택한 사람"}의 추억 카드에 등록했어요.`,
      );
    } catch (error) {
      setErrorMessage(error.message || "추억 카드를 등록하지 못했어요.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="caregiver-memory-register-page">
      <div
        className="caregiver-memory-register-page__background"
        aria-hidden="true"
      />

      <header className="caregiver-memory-register-page__header">
        <div>
          <p>보호자 모드</p>
          <h1>추억 등록</h1>
        </div>

        <Link to="/caregiver">보호자 홈으로 돌아가기</Link>
      </header>

      <form
        className="caregiver-memory-register-page__form"
        onSubmit={handleSubmit}
      >
        <section className="caregiver-memory-register-page__person-panel">
          <label>
            <span>등록할 사람</span>
            <select
              value={selectedPersonId}
              onChange={handlePersonChange}
              disabled={isLoadingPeople || isSaving}
            >
              <option value="">
                {isLoadingPeople
                  ? "사람 목록을 불러오는 중"
                  : "보호자 본인을 선택해주세요"}
              </option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {getPersonLabel(person)}
                </option>
              ))}
            </select>
          </label>

          <p>
            선택한 이름의 인물이 환자 일상 모드에서 인식되면, 등록한 사진과
            글귀가 환자에게 읽기 쉬운 한 문장으로 정리되어 표시됩니다.
          </p>
        </section>

        <section className="caregiver-memory-register-page__photo-panel">
          <label className="caregiver-memory-register-page__photo-picker">
            <span>{previewUrl ? "사진 변경" : "사진 선택"}</span>
            <input
              className="caregiver-memory-register-page__file-input"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              disabled={isSaving}
            />
            <span className="caregiver-memory-register-page__file-control">
              {photoFile?.name || "파일 선택"}
            </span>
          </label>

          <div className="caregiver-memory-register-page__crop-control">
            <span>사진 위치</span>
            {previewUrl ? (
              <div
                className={`caregiver-memory-register-page__crop-frame ${
                  isCropDragging
                    ? "caregiver-memory-register-page__crop-frame--dragging"
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
            ) : (
              <div className="caregiver-memory-register-page__crop-placeholder">
                사진을 선택하면 표시 위치를 조정할 수 있어요.
              </div>
            )}
          </div>
        </section>

        <section className="caregiver-memory-register-page__text-panel">
          <label>
            <span>글귀</span>
            <textarea
              maxLength={DESCRIPTION_MAX_LENGTH}
              placeholder={
                selectedPersonLabel
                  ? `${selectedPersonLabel}님과의 추억을 보호자 입장에서 적어주세요.`
                  : `${patientName}님께 보여줄 따뜻한 글귀를 적어주세요.`
              }
              rows="5"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setMessage("");
                setErrorMessage("");
              }}
              disabled={isSaving}
            />
          </label>

          <div className="caregiver-memory-register-page__form-footer">
            <span>
              {description.length}/{DESCRIPTION_MAX_LENGTH}
            </span>
            <button type="submit" disabled={isSaving || isLoadingPeople}>
              {isSaving ? "등록 중" : "추억 카드 등록"}
            </button>
          </div>

          {(message || errorMessage) && (
            <p
              className={`caregiver-memory-register-page__message ${
                errorMessage ? "is-error" : ""
              }`}
              role="status"
            >
              {errorMessage || message}
            </p>
          )}
        </section>
      </form>
    </main>
  );
}
