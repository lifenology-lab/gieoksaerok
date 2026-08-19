import { useCallback, useState } from "react";

import { loadFaceApiModels } from "../../features/face-recognition/hooks/usePersonRecognition";

import "./DevFaceDescriptorPage.css";

const JIMIN_IMAGES = [
  "/demo-scenes/people/registered/caregiver_demo_1.png",
  "/demo-scenes/people/registered/caregiver_demo_2.png",
];

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`이미지를 불러오지 못했습니다: ${source}`));
    image.src = source;
  });
}

function averageDescriptors(descriptors) {
  return descriptors[0].map((_, index) => {
    const total = descriptors.reduce((sum, descriptor) => sum + descriptor[index], 0);
    return total / descriptors.length;
  });
}

function createDescriptorJson(descriptor) {
  return JSON.stringify({ descriptor }, null, 2);
}

export default function DevFaceDescriptorPage() {
  const [descriptor, setDescriptor] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleExtract = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage("");
      setIsCopied(false);

      const [faceapi, images] = await Promise.all([
        loadFaceApiModels(),
        Promise.all(JIMIN_IMAGES.map(loadImage)),
      ]);
      const detections = await Promise.all(
        images.map((image) =>
          faceapi
            .detectSingleFace(
              image,
              new faceapi.TinyFaceDetectorOptions({
                inputSize: 320,
                scoreThreshold: 0.5,
              }),
            )
            .withFaceLandmarks()
            .withFaceDescriptor(),
        ),
      );

      if (detections.some((detection) => !detection?.descriptor)) {
        throw new Error("두 사진에서 모두 얼굴을 찾을 수 있어야 합니다.");
      }

      setDescriptor(
        averageDescriptors(
          detections.map((detection) => Array.from(detection.descriptor, Number)),
        ),
      );
    } catch (error) {
      setDescriptor(null);
      setErrorMessage(
        error?.message || "얼굴 descriptor를 만드는 중 문제가 발생했어요.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleCopy = useCallback(async () => {
    if (!descriptor) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createDescriptorJson(descriptor));
      setIsCopied(true);
    } catch {
      setErrorMessage("복사하지 못했어요. 아래 내용을 직접 복사해주세요.");
    }
  }, [descriptor]);

  const handleDownload = useCallback(() => {
    if (!descriptor) {
      return;
    }

    const blob = new Blob([createDescriptorJson(descriptor)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "face-descriptor.json";
    link.click();
    URL.revokeObjectURL(url);
  }, [descriptor]);

  const descriptorJson = descriptor ? createDescriptorJson(descriptor) : "";

  return (
    <main className="dev-face-descriptor-page">
      <section className="dev-face-descriptor-page__card">
        <p>개발용 도구</p>
        <h1>김지민 얼굴 descriptor 만들기</h1>
        <span>
          두 보호자 사진의 얼굴 특징을 평균 내어 원본 데모 계정 등록에 사용할
          descriptor를 만듭니다.
        </span>

        <div className="dev-face-descriptor-page__images">
          {JIMIN_IMAGES.map((source) => (
            <img key={source} src={source} alt="김지민 데모 인물" />
          ))}
        </div>

        <button type="button" onClick={handleExtract} disabled={isLoading}>
          {isLoading ? "얼굴 정보를 만들고 있어요" : "descriptor 만들기"}
        </button>

        {errorMessage && <p className="dev-face-descriptor-page__error">{errorMessage}</p>}

        {descriptor && (
          <>
            <p className="dev-face-descriptor-page__complete">
              128개 값이 준비됐어요. 파일을 내려받아
              <code>backend/accounts/demo_seed/people/jimin/</code>에 저장해주세요.
            </p>
            <textarea readOnly value={descriptorJson} rows={9} aria-label="face descriptor JSON" />
            <div className="dev-face-descriptor-page__actions">
              <button type="button" onClick={handleCopy}>
                {isCopied ? "복사했어요" : "JSON 복사"}
              </button>
              <button type="button" onClick={handleDownload}>
                파일 내려받기
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
