import { useState } from "react";

import { classifyPatientQuestion } from "../utils/classifyPatientQuestion";
import { createPatientVoiceResponse } from "../utils/createPatientVoiceResponse";

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

  if (!open) {
    return null;
  }

  const handleSubmit = (event) => {
    event.preventDefault();

    const nextQuestion = question.trim();

    if (!nextQuestion) {
      return;
    }

    setSubmittedQuestion(nextQuestion);
    const result = classifyPatientQuestion(nextQuestion);
    setResponse(createPatientVoiceResponse(result.intent));
  };

  const handleClose = () => {
    setQuestion("");
    setSubmittedQuestion("");
    setResponse(null);
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

        <form className="patient-question-assistant__form" onSubmit={handleSubmit}>
          <label htmlFor="patient-question-input">궁금한 내용을 입력해 주세요</label>
          <textarea
            id="patient-question-input"
            value={question}
            rows="3"
            placeholder="예: 나 아까 점심 뭐 먹었더라?"
            onChange={(event) => setQuestion(event.target.value)}
          />
          <button type="submit" disabled={!question.trim()}>
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
