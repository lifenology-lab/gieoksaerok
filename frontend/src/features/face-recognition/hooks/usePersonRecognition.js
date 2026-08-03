import { useCallback, useEffect, useRef, useState } from "react";

import { createPerson, fetchPeople } from "../api/peopleApi";

const MODEL_URL = "/models/face-api";
const DETECTION_INTERVAL_MS = 800;
const FACE_MATCH_THRESHOLD = 0.55;
const UNKNOWN_PROMPT_COOLDOWN_MS = 6000;
const MODEL_LOAD_ERROR_MESSAGE =
  "인물 인식 모델을 불러오지 못했어요. face-api 모델 파일을 확인해주세요.";
const PEOPLE_LOAD_ERROR_MESSAGE =
  "등록된 사람 목록을 불러오지 못했어요. 백엔드 서버가 실행 중인지 확인해주세요.";

let faceApiModulePromise = null;
let modelLoadPromise = null;

function loadFaceApiModule() {
  if (!faceApiModulePromise) {
    faceApiModulePromise = import(
      "@vladmandic/face-api/dist/face-api.esm.js"
    ).catch((error) => {
      faceApiModulePromise = null;
      error.userMessage = MODEL_LOAD_ERROR_MESSAGE;
      throw error;
    });
  }

  return faceApiModulePromise;
}

async function loadFaceApiModels() {
  const faceapi = await loadFaceApiModule();

  if (!modelLoadPromise) {
    modelLoadPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]).catch((error) => {
      modelLoadPromise = null;
      error.userMessage = MODEL_LOAD_ERROR_MESSAGE;
      throw error;
    });
  }

  await modelLoadPromise;
  return faceapi;
}

function normalizeDescriptor(descriptor) {
  return Array.from(descriptor, Number);
}

function findKnownPerson(faceapi, descriptor, people) {
  let bestMatch = null;

  people.forEach((person) => {
    if (!Array.isArray(person.face_descriptor)) {
      return;
    }

    const distance = faceapi.euclideanDistance(
      descriptor,
      person.face_descriptor,
    );

    if (!bestMatch || distance < bestMatch.distance) {
      bestMatch = { person, distance };
    }
  });

  if (!bestMatch || bestMatch.distance > FACE_MATCH_THRESHOLD) {
    return null;
  }

  return bestMatch;
}

function mapVideoBoxToElementBox(box, videoElement) {
  const sourceWidth = videoElement.videoWidth;
  const sourceHeight = videoElement.videoHeight;
  const elementWidth = videoElement.clientWidth;
  const elementHeight = videoElement.clientHeight;

  if (!sourceWidth || !sourceHeight || !elementWidth || !elementHeight) {
    return null;
  }

  const scale = Math.max(
    elementWidth / sourceWidth,
    elementHeight / sourceHeight,
  );
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const offsetX = (elementWidth - renderedWidth) / 2;
  const offsetY = (elementHeight - renderedHeight) / 2;

  return {
    left: box.x * scale + offsetX,
    top: box.y * scale + offsetY,
    width: box.width * scale,
    height: box.height * scale,
    elementWidth,
    elementHeight,
  };
}

export default function usePersonRecognition({
  enabled,
  videoRef,
  isCameraReady,
}) {
  const [knownPeople, setKnownPeople] = useState([]);
  const [recognizedFaces, setRecognizedFaces] = useState([]);
  const [pendingUnknownFace, setPendingUnknownFace] = useState(null);
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false);
  const [isSavingPerson, setIsSavingPerson] = useState(false);
  const [registrationError, setRegistrationError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const knownPeopleRef = useRef(knownPeople);
  const isRegisterDialogOpenRef = useRef(isRegisterDialogOpen);
  const pendingUnknownFaceRef = useRef(pendingUnknownFace);
  const lastUnknownPromptAtRef = useRef(0);
  const isDetectingRef = useRef(false);

  useEffect(() => {
    knownPeopleRef.current = knownPeople;
  }, [knownPeople]);

  useEffect(() => {
    isRegisterDialogOpenRef.current = isRegisterDialogOpen;
  }, [isRegisterDialogOpen]);

  useEffect(() => {
    pendingUnknownFaceRef.current = pendingUnknownFace;
  }, [pendingUnknownFace]);

  const refreshPeople = useCallback(async () => {
    try {
      const people = await fetchPeople();
      setKnownPeople(people);
      return people;
    } catch (error) {
      error.userMessage = PEOPLE_LOAD_ERROR_MESSAGE;
      throw error;
    }
  }, []);

  const openUnknownPersonDialog = useCallback((face) => {
    const now = Date.now();

    if (
      isRegisterDialogOpenRef.current ||
      pendingUnknownFaceRef.current ||
      now - lastUnknownPromptAtRef.current < UNKNOWN_PROMPT_COOLDOWN_MS
    ) {
      return;
    }

    lastUnknownPromptAtRef.current = now;
    setPendingUnknownFace(face);
    setRegistrationError("");
    setIsRegisterDialogOpen(true);
  }, []);

  const closeUnknownPersonDialog = useCallback(() => {
    lastUnknownPromptAtRef.current = Date.now();
    setIsRegisterDialogOpen(false);
    setPendingUnknownFace(null);
    setRegistrationError("");
  }, []);

  const saveUnknownPerson = useCallback(
    async ({ name, relationship, coreMemory }) => {
      if (!pendingUnknownFaceRef.current) {
        return;
      }

      try {
        setIsSavingPerson(true);
        setRegistrationError("");

        const createdPerson = await createPerson({
          name,
          relationship,
          coreMemory,
          faceDescriptor: pendingUnknownFaceRef.current.descriptor,
        });

        setKnownPeople((people) => [...people, createdPerson]);
        setIsRegisterDialogOpen(false);
        setPendingUnknownFace(null);
        setStatusMessage(`${createdPerson.name}님을 등록했어요.`);
      } catch (error) {
        console.error("Person registration error:", error);
        setRegistrationError(
          error?.message || "사람 정보를 저장하는 중 문제가 발생했어요.",
        );
      } finally {
        setIsSavingPerson(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!enabled) {
      setRecognizedFaces([]);
      setStatusMessage("");
      return undefined;
    }

    if (!isCameraReady) {
      setRecognizedFaces([]);
      setStatusMessage("카메라 준비가 끝나면 인물 인식을 시작할게요.");
      return undefined;
    }

    let isCancelled = false;
    let intervalId = null;
    let faceapi = null;

    const detectFaces = async () => {
      const videoElement = videoRef.current;

      if (
        isCancelled ||
        isDetectingRef.current ||
        !faceapi ||
        !videoElement ||
        videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        return;
      }

      try {
        isDetectingRef.current = true;

        const detections = await faceapi
          .detectAllFaces(
            videoElement,
            new faceapi.TinyFaceDetectorOptions({
              inputSize: 320,
              scoreThreshold: 0.5,
            }),
          )
          .withFaceLandmarks()
          .withFaceDescriptors();

        if (isCancelled) {
          return;
        }

        const faces = detections
          .map((detection, index) => {
            const descriptor = normalizeDescriptor(detection.descriptor);
            const match = findKnownPerson(
              faceapi,
              descriptor,
              knownPeopleRef.current,
            );
            const box = mapVideoBoxToElementBox(
              detection.detection.box,
              videoElement,
            );

            if (!box) {
              return null;
            }

            return {
              id: match?.person?.id
                ? `person-${match.person.id}`
                : `unknown-${index}`,
              box,
              descriptor,
              person: match?.person || null,
              distance: match?.distance || null,
              isKnown: Boolean(match),
            };
          })
          .filter(Boolean);

        const unknownFace = faces.find((face) => !face.isKnown);

        if (unknownFace) {
          openUnknownPersonDialog(unknownFace);
        }

        setRecognizedFaces(faces.filter((face) => face.isKnown));

        if (faces.some((face) => face.isKnown)) {
          setStatusMessage("");
        } else if (unknownFace) {
          setStatusMessage("등록되지 않은 얼굴을 발견했어요.");
        } else {
          setStatusMessage("인물 인식 중입니다.");
        }
      } catch (error) {
        console.error("Face detection error:", error);
        setStatusMessage("얼굴을 인식하는 중 문제가 발생했어요.");
      } finally {
        isDetectingRef.current = false;
      }
    };

    const startRecognition = async () => {
      try {
        setStatusMessage("인물 인식 모델을 불러오고 있어요.");
        faceapi = await loadFaceApiModels();

        if (isCancelled) {
          return;
        }

        setStatusMessage("등록된 사람 목록을 불러오고 있어요.");
        await refreshPeople();

        if (isCancelled) {
          return;
        }

        setStatusMessage("인물 인식 중입니다.");
        await detectFaces();
        intervalId = window.setInterval(detectFaces, DETECTION_INTERVAL_MS);
      } catch (error) {
        console.error("Face recognition start error:", error);

        if (!isCancelled) {
          setStatusMessage(
            error?.userMessage ||
              "인물 인식을 시작하지 못했어요. 잠시 후 다시 시도해주세요.",
          );
        }
      }
    };

    startRecognition();

    return () => {
      isCancelled = true;

      if (intervalId) {
        window.clearInterval(intervalId);
      }

      isDetectingRef.current = false;
      setRecognizedFaces([]);
    };
  }, [
    enabled,
    isCameraReady,
    openUnknownPersonDialog,
    refreshPeople,
    videoRef,
  ]);

  return {
    recognizedFaces,
    statusMessage,
    isRegisterDialogOpen,
    isSavingPerson,
    registrationError,
    refreshPeople,
    closeUnknownPersonDialog,
    saveUnknownPerson,
  };
}
