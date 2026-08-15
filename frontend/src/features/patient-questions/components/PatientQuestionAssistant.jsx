import { useCallback, useEffect, useRef, useState } from "react";

import { fetchRecentMealRecords } from "@/features/meal-recognition/api/mealRecognitionApi";

import {
  classifyPatientQuestionWithModel,
  fetchPatientQuestionSchedules,
  savePatientQuestionEvent,
} from "../api/patientQuestionApi";
import usePatientQuestionRecorder from "../hooks/usePatientQuestionRecorder";
import { classifyPatientQuestion } from "../utils/classifyPatientQuestion";
import { createPatientQuestionResponse } from "../utils/createPatientQuestionResponse";

import "./PatientQuestionAssistant.css";

const EXAMPLE_QUESTIONS = [
  "나 아까 점심 뭐 먹었더라?",
  "나 밥 먹었나?",
  "여기가 어디야?",
];

export default function PatientQuestionAssistant({
  open,
  onClose,
  recordingRequestId,
  microphonePermissionState = "unknown",
  recognizedPerson,
  isUnknownPersonDetected,
  onRequestPersonRecognition,
  onRegisterUnknownPerson,
  onDismissUnknownPersonRegistration,
  onOpenMealRecords,
  onOpenMemoryOverview,
  onOpenMemoryAlbum,
}) {
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [response, setResponse] = useState(null);
  const [isAnswerLoading, setIsAnswerLoading] = useState(false);
  const [answerLoadingMessage, setAnswerLoadingMessage] = useState("");
  const [answerError, setAnswerError] = useState("");
  const [recordError, setRecordError] = useState("");
  const [isTextInputOpen, setIsTextInputOpen] = useState(false);
  const [isWaitingForPersonRecognition, setIsWaitingForPersonRecognition] =
    useState(false);
  const textInputRef = useRef(null);
  const handledRecordingRequestIdRef = useRef(0);

  const saveQuestionEvent = useCallback(
    async ({ transcript, inputMethod, intentType, patientResponse }) => {
      try {
        await savePatientQuestionEvent({
          transcript,
          inputMethod,
          intentType,
          responseSummary: `${patientResponse.title} ${patientResponse.message}`,
          occurredAt: new Date().toISOString(),
        });
      } catch {
        setRecordError("질문 기록을 저장하지 못했어요.");
      }
    },
    [],
  );

  const handleQuestion = useCallback(async (nextQuestion, inputMethod = "text") => {
    const normalizedQuestion = nextQuestion.trim();

    if (!normalizedQuestion) {
      return;
    }

    setQuestion(normalizedQuestion);
    setSubmittedQuestion(normalizedQuestion);
    let result = classifyPatientQuestion(normalizedQuestion);
    setResponse(null);
    setAnswerError("");
    setRecordError("");
    setAnswerLoadingMessage("");
    setIsWaitingForPersonRecognition(false);

    if (result.intent === "unknown") {
      try {
        setIsAnswerLoading(true);
        setAnswerLoadingMessage("질문을 이해하고 있어요.");
        const modelResult = await classifyPatientQuestionWithModel(
          normalizedQuestion,
        );
        result = {
          ...result,
          intent: modelResult.intent || "unknown",
        };
      } catch {
        // 모델 폴백이 실패하면 기존 unknown 안내를 계속 사용한다.
      } finally {
        setIsAnswerLoading(false);
        setAnswerLoadingMessage("");
      }
    }

    if (result.intent === "person") {
      const patientResponse = createPatientQuestionResponse(result.intent, {
        person: recognizedPerson,
        isUnknownPerson: isUnknownPersonDetected,
      });
      const isPersonRecognitionNeeded =
        !recognizedPerson && !isUnknownPersonDetected;

      setResponse(patientResponse);
      setIsWaitingForPersonRecognition(isPersonRecognitionNeeded);

      if (isPersonRecognitionNeeded) {
        onRequestPersonRecognition?.();
      }

      void saveQuestionEvent({
        transcript: normalizedQuestion,
        inputMethod,
        intentType: result.intent,
        patientResponse,
      });
      return;
    }

    if (result.intent !== "meal" && result.intent !== "schedule") {
      const patientResponse = createPatientQuestionResponse(result.intent);
      setResponse(patientResponse);
      void saveQuestionEvent({
        transcript: normalizedQuestion,
        inputMethod,
        intentType: result.intent,
        patientResponse,
      });
      return;
    }

    try {
      setIsAnswerLoading(true);
      setAnswerLoadingMessage(
        result.intent === "meal"
          ? "식사 기록을 확인하고 있어요."
          : "예정된 약속을 확인하고 있어요.",
      );
      const context = result.intent === "meal"
        ? {
            mealRecords: await fetchRecentMealRecords(),
            question: normalizedQuestion,
          }
        : {
            promises: await fetchPatientQuestionSchedules(),
          };
      const patientResponse = createPatientQuestionResponse(result.intent, {
        ...context,
      });
      setResponse(patientResponse);
      void saveQuestionEvent({
        transcript: normalizedQuestion,
        inputMethod,
        intentType: result.intent,
        patientResponse,
      });
    } catch {
      setAnswerError(
        result.intent === "meal"
          ? "식사 기록을 확인하지 못했어요. 잠시 후 다시 물어봐 주세요."
          : "일정을 확인하지 못했어요. 잠시 후 다시 물어봐 주세요.",
      );
    } finally {
      setIsAnswerLoading(false);
      setAnswerLoadingMessage("");
    }
  }, [
    isUnknownPersonDetected,
    onRequestPersonRecognition,
    recognizedPerson,
    saveQuestionEvent,
  ]);

  const questionRecorder = usePatientQuestionRecorder({
    onTranscript: (transcript) => handleQuestion(transcript, "voice"),
  });
  const startQuestionRecording = questionRecorder.startRecording;
  const isRecording = questionRecorder.recordingStatus === "recording";
  const isRecordingBusy = ["preparing", "recording", "transcribing"].includes(
    questionRecorder.recordingStatus,
  );
  const isMicrophonePermissionDenied = microphonePermissionState === "denied";
  const isMicrophoneUnavailable =
    isMicrophonePermissionDenied ||
    (questionRecorder.recordingStatus === "error" && !isRecording);
  const microphonePermissionMessage = isMicrophonePermissionDenied
    ? "마이크 사용을 허용해 주세요. 브라우저 설정에서 마이크 접근을 켠 뒤 다시 말해 보세요."
    : questionRecorder.errorMessage;
  const isMicrophonePreparing =
    !isMicrophonePermissionDenied &&
    (questionRecorder.recordingStatus === "preparing" ||
    Boolean(
      open &&
        recordingRequestId &&
        handledRecordingRequestIdRef.current !== recordingRequestId,
    ));
  const voiceActionLabel = isRecording
    ? "말하기 끝내기"
    : questionRecorder.recordingStatus === "preparing"
      ? "마이크를 켜고 있어요"
      : questionRecorder.recordingStatus === "transcribing"
        ? "말씀을 확인하고 있어요"
        : questionRecorder.recordingStatus === "error"
          ? "다시 말하기"
          : "말로 물어보기";
  const assistantHeading = submittedQuestion
    ? isAnswerLoading
      ? "말씀을 확인하고 있어요"
      : "이렇게 도와드릴게요"
    : isMicrophoneUnavailable
      ? "마이크를 사용할 수 없어요"
    : isMicrophonePreparing
      ? "마이크를 준비하고 있어요"
      : "새록이가 듣고 있어요";
  const assistantHeadingDescription = submittedQuestion
    ? isAnswerLoading
      ? "잠시만 기다려 주세요."
      : "다시 물어보고 싶으면 아래 버튼을 눌러 주세요."
    : isMicrophoneUnavailable
      ? "텍스트로 질문하면 바로 도와드릴게요."
    : isMicrophonePreparing
      ? "잠시만 기다려 주세요."
    : "궁금한 점을 천천히 말씀해 주세요.";

  useEffect(() => {
    if (isTextInputOpen) {
      textInputRef.current?.focus();
    }
  }, [isTextInputOpen]);

  useEffect(() => {
    if (
      !open ||
      !recordingRequestId ||
      isMicrophonePermissionDenied ||
      handledRecordingRequestIdRef.current === recordingRequestId
    ) {
      return;
    }

    handledRecordingRequestIdRef.current = recordingRequestId;
    startQuestionRecording();
  }, [
    isMicrophonePermissionDenied,
    open,
    recordingRequestId,
    startQuestionRecording,
  ]);

  useEffect(() => {
    if (!isWaitingForPersonRecognition) {
      return;
    }

    if (recognizedPerson) {
      setResponse(
        createPatientQuestionResponse("person", { person: recognizedPerson }),
      );
    } else if (isUnknownPersonDetected) {
      setResponse(
        createPatientQuestionResponse("person", { isUnknownPerson: true }),
      );
    } else {
      return;
    }

    setIsWaitingForPersonRecognition(false);
  }, [
    isUnknownPersonDetected,
    isWaitingForPersonRecognition,
    recognizedPerson,
  ]);

  if (!open) {
    return null;
  }

  const handleTextSubmit = async (event) => {
    event.preventDefault();

    await handleQuestion(question);

    if (question.trim()) {
      setIsTextInputOpen(false);
    }
  };

  const resetAssistantState = () => {
    setQuestion("");
    setSubmittedQuestion("");
    setResponse(null);
    setAnswerError("");
    setRecordError("");
    setIsAnswerLoading(false);
    setAnswerLoadingMessage("");
    setIsTextInputOpen(false);
    setIsWaitingForPersonRecognition(false);
  };

  const handleClose = () => {
    if (isUnknownPersonDetected) {
      onDismissUnknownPersonRegistration?.();
    }

    questionRecorder.cancelRecording();
    resetAssistantState();
    onClose();
  };

  const handleTextInputClose = () => {
    setQuestion("");
    setIsTextInputOpen(false);
  };

  const handleOpenTextInput = () => {
    if (isRecording) {
      questionRecorder.cancelRecording();
    }

    setIsTextInputOpen(true);
  };

  const handleRestartVoiceQuestion = () => {
    if (response?.action === "register-unknown-person") {
      onDismissUnknownPersonRegistration?.();
    }

    resetAssistantState();
    questionRecorder.startRecording();
  };

  const handleOpenTextQuestion = () => {
    if (response?.action === "register-unknown-person") {
      onDismissUnknownPersonRegistration?.();
    }

    resetAssistantState();
    setIsTextInputOpen(true);
  };

  const handleUnknownPersonRegistration = () => {
    resetAssistantState();
    onRegisterUnknownPerson?.();
  };

  const handleResponseContextAction = () => {
    if (!response?.action) {
      return;
    }

    if (response.action === "open-meal-records") {
      questionRecorder.cancelRecording();
      resetAssistantState();
      onOpenMealRecords?.();
      return;
    }

    if (response.action === "open-memory-overview") {
      questionRecorder.cancelRecording();
      resetAssistantState();
      onOpenMemoryOverview?.(response.overviewTab);
      return;
    }

    if (response.action === "open-person-memory" && response.person?.id) {
      questionRecorder.cancelRecording();
      resetAssistantState();
      onOpenMemoryAlbum?.(response.person);
    }
  };

  return (
    <section
      className="patient-question-assistant"
      role="dialog"
      aria-modal="true"
      aria-labelledby="patient-question-assistant-title"
    >
      <article className="patient-question-assistant__card">
        <button
          className="patient-question-assistant__close"
          type="button"
          aria-label="질문 도우미 닫기"
          onClick={handleClose}
        >
          ×
        </button>

        {!isTextInputOpen && (
          <div
            className={`patient-question-assistant__heading ${isRecording ? "is-recording" : ""}`}
          >
            <span aria-hidden="true">●</span>
            <div>
              <h2 id="patient-question-assistant-title">
                {assistantHeading}
              </h2>
              <p>{assistantHeadingDescription}</p>
            </div>
          </div>
        )}

        {!submittedQuestion && !isTextInputOpen && !isMicrophoneUnavailable && !isMicrophonePreparing && (
          <>
            <section className="patient-question-assistant__voice-input">
          {isRecording && (
            <div
              className="patient-question-assistant__voice-wave"
              aria-hidden="true"
            >
              {[0, 1, 2, 3, 4].map((barIndex) => (
                <span key={barIndex} />
              ))}
            </div>
          )}
          <div className="patient-question-assistant__voice-actions">
            <button
              type="button"
              className={`patient-question-assistant__voice-primary-button ${isRecording ? "is-recording" : ""}`}
              disabled={
                isAnswerLoading ||
                questionRecorder.recordingStatus === "preparing" ||
                questionRecorder.recordingStatus === "transcribing"
              }
              onClick={
                isRecording
                  ? questionRecorder.stopRecording
                  : questionRecorder.startRecording
              }
            >
              <span aria-hidden="true">●</span>
              {voiceActionLabel}
            </button>

            {isRecording && (
              <button
                type="button"
                className="patient-question-assistant__voice-cancel-button"
                onClick={questionRecorder.cancelRecording}
              >
                취소
              </button>
            )}
          </div>
          <p aria-live="polite">
            {questionRecorder.statusMessage || "버튼을 누른 뒤 천천히 말씀해 주세요."}
          </p>
          {isRecording && (
            <p className="patient-question-assistant__voice-tip">
              말씀을 마치고 잠시 기다리면 자동으로 끝나요. 바로 끝내려면
              ‘말하기 끝내기’를 눌러 주세요.
            </p>
          )}
          {!isRecordingBusy && (
            <p className="patient-question-assistant__voice-tip">
              주변이 시끄럽거나 마이크가 어렵다면 텍스트로 질문할 수 있어요.
            </p>
          )}
            </section>

            <button
              type="button"
              className="patient-question-assistant__text-action"
              disabled={
                isAnswerLoading ||
                questionRecorder.recordingStatus === "preparing" ||
                questionRecorder.recordingStatus === "transcribing"
              }
              aria-expanded={isTextInputOpen}
              onClick={handleOpenTextInput}
            >
              텍스트로 입력하기
            </button>
          </>
        )}

        {!submittedQuestion && !isTextInputOpen && !isMicrophoneUnavailable && !isMicrophonePreparing && (
          <div className="patient-question-assistant__examples">
            <p>이렇게 물어볼 수 있어요</p>
            <div>
              {EXAMPLE_QUESTIONS.map((exampleQuestion) => (
                <button
                  key={exampleQuestion}
                  type="button"
                  onClick={() => {
                    setQuestion(exampleQuestion);
                    handleOpenTextInput();
                  }}
                >
                  {exampleQuestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {!submittedQuestion && !isTextInputOpen && isMicrophonePreparing && (
          <section className="patient-question-assistant__preparing-panel" role="status">
            <div className="patient-question-assistant__voice-wave" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((barIndex) => (
                <span key={barIndex} />
              ))}
            </div>
            <p>마이크 연결을 확인하고 있어요.</p>
          </section>
        )}

        {!submittedQuestion && !isTextInputOpen && isMicrophoneUnavailable && (
          <section className="patient-question-assistant__permission-panel" role="alert">
            <p>{microphonePermissionMessage}</p>
            <div className="patient-question-assistant__response-actions">
              <button
                type="button"
                className="patient-question-assistant__response-primary-action"
                onClick={handleOpenTextInput}
              >
                텍스트로 물어보기
              </button>
              <button type="button" onClick={handleClose}>
                닫기
              </button>
            </div>
          </section>
        )}

        {submittedQuestion && (
          <>
            <div className="patient-question-assistant__transcript">
              <span>이렇게 들었어요</span>
              <strong>“{submittedQuestion}”</strong>
            </div>

            {isAnswerLoading && (
              <p className="patient-question-assistant__loading" role="status">
                {answerLoadingMessage}
              </p>
            )}

            {answerError && (
              <p className="patient-question-assistant__error" role="alert">
                {answerError}
              </p>
            )}

            {recordError && (
              <p className="patient-question-assistant__record-error" role="status">
                {recordError}
              </p>
            )}

            {response && (
              <div className="patient-question-assistant__response" role="status">
                <h3>{response.title}</h3>
                <p>{response.message}</p>
                <div className="patient-question-assistant__response-actions">
                  {response.action === "register-unknown-person" && (
                    <button
                      type="button"
                      className="patient-question-assistant__response-primary-action"
                      onClick={handleUnknownPersonRegistration}
                    >
                      {response.actionLabel}
                    </button>
                  )}
                  {response.action && response.action !== "register-unknown-person" && (
                    <button
                      type="button"
                      className="patient-question-assistant__response-primary-action"
                      onClick={handleResponseContextAction}
                    >
                      {response.actionLabel}
                    </button>
                  )}
                  <button type="button" onClick={handleRestartVoiceQuestion}>
                    다시 물어보기
                  </button>
                </div>
              </div>
            )}

            {answerError && !response && (
              <div className="patient-question-assistant__response-actions">
                <button type="button" onClick={handleRestartVoiceQuestion}>
                  다시 물어보기
                </button>
                <button type="button" onClick={handleOpenTextQuestion}>
                  텍스트로 물어보기
                </button>
              </div>
            )}
          </>
        )}

        {isTextInputOpen && (
          <section
            className="patient-question-assistant__text-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="patient-question-text-title"
          >
            <form
              className="patient-question-assistant__form"
              onSubmit={handleTextSubmit}
            >
              <div className="patient-question-assistant__text-modal-heading">
                <div>
                  <h3 id="patient-question-text-title">글자로 질문하기</h3>
                  <p>궁금한 내용을 천천히 입력해 주세요.</p>
                </div>
                <button
                  type="button"
                  aria-label="텍스트 입력 닫기"
                  onClick={handleTextInputClose}
                >
                  ×
                </button>
              </div>

              <label htmlFor="patient-question-input">궁금한 내용</label>
              <textarea
                ref={textInputRef}
                id="patient-question-input"
                value={question}
                rows="4"
                placeholder="예: 나 아까 점심 뭐 먹었더라?"
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <button type="submit" disabled={!question.trim() || isAnswerLoading}>
                질문하기
              </button>

              <div className="patient-question-assistant__examples">
                <p>이렇게 물어볼 수 있어요</p>
                <div>
                  {EXAMPLE_QUESTIONS.map((exampleQuestion) => (
                    <button
                      key={exampleQuestion}
                      type="button"
                      onClick={() => setQuestion(exampleQuestion)}
                    >
                      {exampleQuestion}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          </section>
        )}
      </article>
    </section>
  );
}
