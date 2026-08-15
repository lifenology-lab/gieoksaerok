import { useCallback, useEffect, useRef, useState } from "react";

import { fetchRecentMealRecords } from "@/features/meal-recognition/api/mealRecognitionApi";

import {
  classifyPatientQuestionWithModel,
  fetchPatientQuestionSchedules,
  savePatientQuestionEvent,
} from "../api/patientQuestionApi";
import usePatientAnswerSpeech from "../hooks/usePatientAnswerSpeech";
import usePatientQuestionRecorder from "../hooks/usePatientQuestionRecorder";
import { classifyPatientQuestion } from "../utils/classifyPatientQuestion";
import { createPatientAnswerSpeechText } from "../utils/createPatientAnswerSpeechText";
import { createPatientQuestionResponse } from "../utils/createPatientQuestionResponse";

import "./PatientQuestionAssistant.css";

const EXAMPLE_QUESTIONS = [
  "나 아까 점심 뭐 먹었더라?",
  "나 밥 먹었나?",
  "여기가 어디야?",
];

const DAILY_MODE_AUDIO_WARMUP_TEXT = "안녕하세요. 기억새록이에요.";

export default function PatientQuestionAssistant({
  open,
  onClose,
  recordingRequestId,
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
  const {
    errorMessage: speechErrorMessage,
    play: playAnswerSpeech,
    preload: preloadAnswerSpeech,
    status: speechStatus,
    stop: stopAnswerSpeech,
  } = usePatientAnswerSpeech();
  const warmedAudioRef = useRef(false);

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
    stopAnswerSpeech();
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
    stopAnswerSpeech,
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
  const voiceActionLabel = isRecording
    ? "말하기 끝내기"
    : questionRecorder.recordingStatus === "preparing"
      ? "마이크를 켜고 있어요"
      : questionRecorder.recordingStatus === "transcribing"
        ? "말씀을 확인하고 있어요"
        : questionRecorder.recordingStatus === "error"
          ? "다시 말하기"
          : "말로 물어보기";
  const isMicrophoneUnavailable =
    questionRecorder.recordingStatus === "error" &&
    Boolean(questionRecorder.errorMessage);
  const panelView = isTextInputOpen
    ? "text-input"
    : isAnswerLoading || ["preparing", "transcribing"].includes(
            questionRecorder.recordingStatus,
          )
        ? "processing"
        : response
          ? "answer"
          : answerError
            ? "answer-error"
            : isMicrophoneUnavailable
              ? "microphone-permission"
              : isRecording
                ? "recording"
                : "start";
  const panelHeading = {
    start: "새록이에게 물어보세요",
    recording: "말씀해 주세요",
    processing: "말씀을 확인하고 있어요",
    "answer-error": "답변을 확인하지 못했어요",
    answer: "새록이가 알려드릴게요",
    "text-input": "글자로 질문하기",
    "microphone-permission": "마이크를 사용할 수 없어요",
  }[panelView];
  const panelDescription = {
    start: "궁금한 점을 천천히 말씀해 주세요.",
    recording: "말씀을 마치면 잠시 기다려 주세요.",
    processing: answerLoadingMessage || questionRecorder.statusMessage,
    "answer-error": answerError,
    answer: "필요하면 안내를 다시 들을 수 있어요.",
    "text-input": "궁금한 내용을 천천히 입력해 주세요.",
    "microphone-permission": "설정에서 마이크를 허용하면 말로 물어볼 수 있어요.",
  }[panelView];

  useEffect(() => {
    if (isTextInputOpen) {
      textInputRef.current?.focus();
    }
  }, [isTextInputOpen]);

  useEffect(() => {
    if (warmedAudioRef.current) {
      return;
    }

    warmedAudioRef.current = true;
    void preloadAnswerSpeech(DAILY_MODE_AUDIO_WARMUP_TEXT);
  }, [preloadAnswerSpeech]);

  const handledRecordingRequestIdRef = useRef(0);

  useEffect(() => {
    if (
      !open ||
      !recordingRequestId ||
      handledRecordingRequestIdRef.current === recordingRequestId
    ) {
      return;
    }

    handledRecordingRequestIdRef.current = recordingRequestId;
    startQuestionRecording();
  }, [open, recordingRequestId, startQuestionRecording]);

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

  const responseSpeechText = createPatientAnswerSpeechText(response);
  const hasPrimaryResponseAction = Boolean(response?.action);

  useEffect(() => {
    if (!open || !responseSpeechText) {
      return;
    }

    void playAnswerSpeech(responseSpeechText, { autoplay: true });
  }, [open, playAnswerSpeech, responseSpeechText]);

  if (!open) {
    return null;
  }

  const handleTextSubmit = async (event) => {
    event.preventDefault();

    if (!question.trim()) {
      return;
    }

    setIsTextInputOpen(false);
    await handleQuestion(question);
  };

  const resetAssistantState = () => {
    stopAnswerSpeech();
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

  const speechActionLabel =
    speechStatus === "loading"
      ? "안내를 준비하고 있어요"
        : speechStatus === "playing"
          ? "안내 멈추기"
          : "새록이의 안내 듣기";

  const handleResponseSpeech = () => {
    if (speechStatus === "playing") {
      stopAnswerSpeech();
      return;
    }

    void playAnswerSpeech(responseSpeechText);
  };

  return (
    <section
      className="patient-question-assistant"
      role="dialog"
      aria-modal="true"
      aria-labelledby="patient-question-assistant-title"
    >
      <article className={`patient-question-assistant__card is-${panelView}`}>
        <button
          className="patient-question-assistant__close"
          type="button"
          aria-label="질문 도우미 닫기"
          onClick={handleClose}
        >
          ×
        </button>

        {panelView !== "answer" && (
          <div className={`patient-question-assistant__heading ${isRecording ? "is-recording" : ""}`}>
            <span aria-hidden="true">●</span>
            <div>
              <h2 id="patient-question-assistant-title">{panelHeading}</h2>
              <p>{panelDescription}</p>
            </div>
          </div>
        )}

        {["start", "recording"].includes(panelView) && (
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

        {panelView === "start" && (
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

        {panelView === "processing" && (
          <div className="patient-question-assistant__processing" role="status">
            <div className="patient-question-assistant__voice-wave" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((barIndex) => (
                <span key={barIndex} />
              ))}
            </div>
            {submittedQuestion && <p>“{submittedQuestion}”</p>}
          </div>
        )}

        {panelView === "answer" && response && (
          <>
            <div className="patient-question-assistant__transcript">
              <span id="patient-question-assistant-title">이렇게 들었어요</span>
              <strong>“{submittedQuestion}”</strong>
            </div>
            {recordError && (
              <p className="patient-question-assistant__record-error" role="status">
                {recordError}
              </p>
            )}
            <div className="patient-question-assistant__response" role="status">
              <h3>{response.title}</h3>
              <p className="patient-question-assistant__response-message">
                {response.message}
              </p>
              {responseSpeechText && (
                <button
                  type="button"
                  className={`patient-question-assistant__speech-action ${speechStatus === "playing" ? "is-playing" : ""}`}
                  disabled={speechStatus === "loading"}
                  aria-pressed={speechStatus === "playing"}
                  onClick={handleResponseSpeech}
                >
                  <span className="patient-question-assistant__speech-wave" aria-hidden="true">
                    {[0, 1, 2, 3].map((barIndex) => <i key={barIndex} />)}
                  </span>
                  {speechActionLabel}
                </button>
              )}
              {speechErrorMessage && (
                <p className="patient-question-assistant__speech-error" role="alert">
                  {speechErrorMessage}
                </p>
              )}
              {speechStatus === "ready" && (
                <p className="patient-question-assistant__audio-notice">
                  소리가 들리지 않으면 기기의 미디어 음량과 무음 모드를 확인해 주세요.
                </p>
              )}
              <div className="patient-question-assistant__response-actions">
                {response.action === "register-unknown-person" && (
                  <button type="button" className="patient-question-assistant__response-primary-action" onClick={handleUnknownPersonRegistration}>
                    {response.actionLabel}
                  </button>
                )}
                {response.action && response.action !== "register-unknown-person" && (
                  <button type="button" className="patient-question-assistant__response-primary-action" onClick={handleResponseContextAction}>
                    {response.actionLabel}
                  </button>
                )}
                <button type="button" className={!hasPrimaryResponseAction ? "is-only-action" : ""} onClick={handleRestartVoiceQuestion}>
                  다시 말하기
                </button>
              </div>
            </div>
          </>
        )}

        {panelView === "microphone-permission" && (
          <div className="patient-question-assistant__permission-panel" role="alert">
            <p>{questionRecorder.errorMessage}</p>
            <div className="patient-question-assistant__response-actions">
              <button type="button" className="patient-question-assistant__response-primary-action" onClick={handleOpenTextQuestion}>
                텍스트로 물어보기
              </button>
              <button type="button" onClick={handleClose}>닫기</button>
            </div>
          </div>
        )}

        {panelView === "answer-error" && (
          <div className="patient-question-assistant__permission-panel" role="alert">
            <div className="patient-question-assistant__response-actions">
              <button type="button" className="patient-question-assistant__response-primary-action" onClick={handleRestartVoiceQuestion}>
                다시 물어보기
              </button>
              <button type="button" onClick={handleOpenTextQuestion}>
                텍스트로 물어보기
              </button>
            </div>
          </div>
        )}

        {panelView === "text-input" && (
          <form className="patient-question-assistant__form" onSubmit={handleTextSubmit}>
            <label htmlFor="patient-question-input">궁금한 내용</label>
            <textarea
              ref={textInputRef}
              id="patient-question-input"
              value={question}
              rows="3"
              enterKeyHint="send"
              placeholder="예: 나 아까 점심 뭐 먹었더라?"
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  question.trim() &&
                  !isAnswerLoading
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="patient-question-assistant__response-actions">
              <button type="submit" className="patient-question-assistant__response-primary-action" disabled={!question.trim() || isAnswerLoading}>
                질문하기
              </button>
              <button type="button" onClick={handleTextInputClose}>돌아가기</button>
            </div>
          </form>
        )}
      </article>
    </section>
  );
}
