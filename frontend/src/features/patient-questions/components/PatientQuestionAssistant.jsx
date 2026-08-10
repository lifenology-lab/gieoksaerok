import { useCallback, useState } from "react";

import { fetchRecentMealRecords } from "@/features/meal-recognition/api/mealRecognitionApi";

import { savePatientQuestionEvent } from "../api/patientQuestionApi";
import usePatientQuestionRecorder from "../hooks/usePatientQuestionRecorder";
import { classifyPatientQuestion } from "../utils/classifyPatientQuestion";
import { createPatientQuestionResponse } from "../utils/createPatientQuestionResponse";

import "./PatientQuestionAssistant.css";

const EXAMPLE_QUESTIONS = [
  "나 아까 점심 뭐 먹었더라?",
  "나 밥 먹었나?",
  "여기가 어디야?",
];

export default function PatientQuestionAssistant({ open, onClose }) {
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [response, setResponse] = useState(null);
  const [isAnswerLoading, setIsAnswerLoading] = useState(false);
  const [answerError, setAnswerError] = useState("");
  const [recordError, setRecordError] = useState("");

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
    const result = classifyPatientQuestion(normalizedQuestion);
    setResponse(null);
    setAnswerError("");
    setRecordError("");

    if (result.intent !== "meal") {
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
      const mealRecords = await fetchRecentMealRecords();
      const patientResponse = createPatientQuestionResponse(result.intent, {
        mealRecord: mealRecords[0] || null,
      });
      setResponse(patientResponse);
      void saveQuestionEvent({
        transcript: normalizedQuestion,
        inputMethod,
        intentType: result.intent,
        patientResponse,
      });
    } catch {
      setAnswerError("식사 기록을 확인하지 못했어요. 잠시 후 다시 물어봐 주세요.");
    } finally {
      setIsAnswerLoading(false);
    }
  }, [saveQuestionEvent]);

  const questionRecorder = usePatientQuestionRecorder({
    onTranscript: (transcript) => handleQuestion(transcript, "voice"),
  });
  const isRecording = questionRecorder.recordingStatus === "recording";
  const isRecordingBusy = ["preparing", "recording", "transcribing"].includes(
    questionRecorder.recordingStatus,
  );

  if (!open) {
    return null;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();

    await handleQuestion(question);
  };

  const handleClose = () => {
    setQuestion("");
    setSubmittedQuestion("");
    setResponse(null);
    setAnswerError("");
    setRecordError("");
    setIsAnswerLoading(false);
    onClose();
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

        <div className="patient-question-assistant__heading">
          <span aria-hidden="true">?</span>
          <div>
            <h2 id="patient-question-assistant-title">
              무엇이 궁금하신가요?
            </h2>
            <p>천천히 말하거나 직접 입력해 주세요.</p>
          </div>
        </div>

        <section className="patient-question-assistant__voice-input">
          <button
            type="button"
            className={isRecording ? "is-recording" : ""}
            disabled={isAnswerLoading || questionRecorder.recordingStatus === "preparing" || questionRecorder.recordingStatus === "transcribing"}
            onClick={
              isRecording
                ? questionRecorder.stopRecording
                : questionRecorder.startRecording
            }
          >
            <span aria-hidden="true">●</span>
            {isRecording ? "말하기 끝내기" : "말로 물어보기"}
          </button>
          <p aria-live="polite">
            {questionRecorder.statusMessage || "버튼을 누르고 천천히 말씀해 주세요."}
          </p>
          {questionRecorder.errorMessage && (
            <p className="patient-question-assistant__error" role="alert">
              {questionRecorder.errorMessage}
            </p>
          )}
        </section>

        <form className="patient-question-assistant__form" onSubmit={handleSubmit}>
          <label htmlFor="patient-question-input">궁금한 내용을 입력해 주세요</label>
          <textarea
            id="patient-question-input"
            value={question}
            rows="3"
            placeholder="예: 나 아까 점심 뭐 먹었더라?"
            disabled={isRecordingBusy}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <button type="submit" disabled={!question.trim() || isAnswerLoading || isRecordingBusy}>
            질문하기
          </button>
        </form>

        {!submittedQuestion && (
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
        )}

        {submittedQuestion && (
          <>
            <div className="patient-question-assistant__transcript">
              <span>이렇게 들었어요</span>
              <strong>“{submittedQuestion}”</strong>
            </div>

            {isAnswerLoading && (
              <p className="patient-question-assistant__loading" role="status">
                식사 기록을 확인하고 있어요.
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
                <p>{response.suggestion}</p>
                <button
                  type="button"
                  onClick={() => {
                    setSubmittedQuestion("");
                    setResponse(null);
                    setAnswerError("");
                    setRecordError("");
                  }}
                >
                  다른 질문하기
                </button>
              </div>
            )}
          </>
        )}
      </article>
    </section>
  );
}
