import { useEffect, useState } from "react";

import usePatientQuestionRecorder from "@/features/patient-questions/hooks/usePatientQuestionRecorder";
import VoiceAssistantCard from "@/shared/components/VoiceAssistantCard";
import "@/features/patient-questions/components/PatientQuestionAssistant.css";

import {
  requestMemoryReflectionAudio,
  requestMemoryReflectionText,
} from "../api/patientMemoryApi";

import "./MemoryReflectionAssistant.css";

const MAX_VISIBLE_MESSAGES = 6;

export default function MemoryReflectionAssistant({
  reflectionItem,
  session,
  onSessionChange,
  onClose,
  isEmbedded = false,
}) {
  const [isReplyLoading, setIsReplyLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isTextMode, setIsTextMode] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const messages = session?.messages || [];
  const summary = session?.summary || "";

  const updateConversation = (result, source) => {
    const nextTranscript = result.transcript?.trim();

    if (!nextTranscript) {
      throw new Error("말씀하신 내용을 확인하지 못했어요. 다시 말씀해 주세요.");
    }

    const nextMessages = [
      ...messages,
      { role: "user", content: nextTranscript, source },
    ].slice(-MAX_VISIBLE_MESSAGES);

    onSessionChange({
      messages: [
        ...nextMessages,
        { role: "assistant", content: result.reply || "이야기를 함께 들었어요." },
      ].slice(-MAX_VISIBLE_MESSAGES),
      summary: result.summary || summary,
      lastActiveAt: Date.now(),
    });
  };

  const handleAudio = async ({ audioBlob }) => {
    setErrorMessage("");
    setIsReplyLoading(true);

    try {
      const result = await requestMemoryReflectionAudio({
        personId: reflectionItem.person.id,
        albumItemId: reflectionItem.id,
        audioBlob,
        history: messages.slice(-MAX_VISIBLE_MESSAGES),
        summary,
      });
      updateConversation(result, "voice");
    } catch (error) {
      setErrorMessage(error.message || "이야기에 답하지 못했어요.");
    } finally {
      setIsReplyLoading(false);
    }
  };

  const recorder = usePatientQuestionRecorder({ processAudio: handleAudio });
  const startRecording = recorder.startRecording;
  const cancelRecording = recorder.cancelRecording;
  const isRecording = recorder.recordingStatus === "recording";
  const isPreparing = recorder.recordingStatus === "preparing";
  const isProcessing = recorder.recordingStatus === "transcribing" || isReplyLoading;
  const isMicrophoneUnavailable =
    recorder.recordingStatus === "error" && !isRecording;
  const hasConversation = messages.length > 0;
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const latestAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant")?.content;
  const isMicrophonePermissionError = /마이크.*(?:허용|권한)|NotAllowedError/i.test(
    recorder.errorMessage || "",
  );

  const title = isMicrophoneUnavailable
    ? "마이크를 사용할 수 없어요"
    : isPreparing
    ? "마이크를 켜고 있어요"
    : isRecording
      ? "이제 말씀해 주세요"
      : isProcessing
        ? "말씀을 확인하고 있어요"
        : "새록이가 듣고 있어요";
  const description = isMicrophoneUnavailable
    ? "텍스트로 질문하면 바로 도와드릴게요."
    : isPreparing
    ? "준비가 끝날 때까지 잠시만 기다려 주세요."
    : isRecording
      ? "파형이 움직이면 사진을 보며 천천히 말씀해 주세요."
      : isProcessing
        ? "전사와 답변을 준비하는 동안 잠시 기다려 주세요."
        : "궁금한 점을 천천히 말씀해 주세요.";

  useEffect(() => {
    if (!hasConversation) {
      startRecording();
    }

    return () => cancelRecording();
  }, [cancelRecording, hasConversation, reflectionItem.id, startRecording]);

  const handleClose = () => {
    recorder.cancelRecording();
    onClose();
  };

  const handleContinue = () => {
    setErrorMessage("");
    recorder.startRecording();
  };

  const handleTextSubmit = async (event) => {
    event.preventDefault();

    const transcript = textDraft.trim();
    if (!transcript || isProcessing) {
      return;
    }

    setErrorMessage("");
    setIsReplyLoading(true);

    try {
      const result = await requestMemoryReflectionText({
        personId: reflectionItem.person.id,
        albumItemId: reflectionItem.id,
        transcript,
        history: messages.slice(-MAX_VISIBLE_MESSAGES),
        summary,
      });
      updateConversation(result, "text");
      setTextDraft("");
      setIsTextMode(false);
    } catch (error) {
      setErrorMessage(error.message || "이야기에 답하지 못했어요.");
    } finally {
      setIsReplyLoading(false);
    }
  };

  return (
    <VoiceAssistantCard
      className={`patient-question-assistant memory-reflection-assistant-shell${hasConversation ? " is-conversation" : ""}`}
      ariaLabelledBy="memory-reflection-assistant-title"
      closeLabel="회상 대화 닫기"
      onClose={handleClose}
      isEmbedded={isEmbedded}
    >
      <section
        className={`memory-reflection-assistant ${isRecording ? "is-recording" : ""}`}
        aria-live="polite"
      >
      {(!hasConversation || isMicrophoneUnavailable) && !isTextMode && (
        <div className={`patient-question-assistant__heading ${isRecording ? "is-recording" : ""}`}>
          <span aria-hidden="true">●</span>
          <div>
            <h2 id="memory-reflection-assistant-title">{title}</h2>
            <p>{description}</p>
          </div>
        </div>
      )}

      {!hasConversation && !isMicrophoneUnavailable && (
        <div className="memory-reflection-assistant__recording">
          {isRecording && (
            <div className="patient-question-assistant__voice-wave" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((barIndex) => <span key={barIndex} />)}
            </div>
          )}
          {isPreparing || isProcessing ? (
            <div className="patient-question-assistant__preparing-panel" aria-live="polite">
              {isPreparing ? "마이크를 준비하고 있어요" : "말씀을 확인하고 있어요"}
            </div>
          ) : (
            <div className="patient-question-assistant__voice-actions">
              <button
                type="button"
                className={`patient-question-assistant__voice-primary-button ${isRecording ? "is-recording" : ""}`}
                onClick={isRecording ? recorder.stopRecording : recorder.startRecording}
              >
                <span aria-hidden="true">●</span>
                {isRecording ? "말하기 끝내기" : "말로 물어보기"}
              </button>
              {isRecording && (
                <button type="button" className="patient-question-assistant__voice-cancel-button" onClick={recorder.cancelRecording}>취소</button>
              )}
            </div>
          )}
          <p>{recorder.statusMessage || "말씀을 마치고 잠시 기다리면 자동으로 끝나요."}</p>
          {!isRecording && !isPreparing && !isProcessing && (
            <button type="button" className="patient-question-assistant__text-action" onClick={() => setIsTextMode(true)}>텍스트로 입력하기</button>
          )}
        </div>
      )}

      {isMicrophoneUnavailable && !isTextMode && (
        <section className="patient-question-assistant__permission-panel" role="alert">
          <p>{recorder.errorMessage}</p>
          <div className="patient-question-assistant__response-actions">
            <button
              type="button"
              className="patient-question-assistant__response-primary-action"
              onClick={() => setIsTextMode(true)}
            >
              텍스트로 물어보기
            </button>
            <button type="button" onClick={handleClose}>닫기</button>
          </div>
        </section>
      )}

      {recorder.errorMessage && !isMicrophoneUnavailable && (
        <div
          className={`memory-reflection-assistant__error${isMicrophonePermissionError ? " is-permission-error" : ""}`}
          role="alert"
        >
          {isMicrophonePermissionError && <strong>마이크를 사용할 수 없어요</strong>}
          <p>{recorder.errorMessage}</p>
        </div>
      )}

      {hasConversation && !isMicrophoneUnavailable && (
        <div className="memory-reflection-assistant__conversation">
          {isProcessing && (
            <div className="memory-reflection-assistant__status" aria-live="polite">
              말씀을 확인하고 있어요
            </div>
          )}
          <div className={`memory-reflection-assistant__agent-layout${isProcessing ? " is-processing" : ""}`}>
            <div className="memory-reflection-assistant__response" aria-label="새록이의 회상 안내">
              {latestUserMessage && (
                <div className="memory-reflection-assistant__transcript">
                  <span>{latestUserMessage.source === "text" ? "이렇게 남겼어요" : "이렇게 들었어요"}</span>
                  <p>“{latestUserMessage.content}”</p>
                  {latestUserMessage.source !== "text" && !isProcessing && !isRecording && (
                    <button type="button" onClick={handleContinue}>다시 말하기</button>
                  )}
                </div>
              )}
              <p className="memory-reflection-assistant__answer">
                {isProcessing
                  ? "새록이가 이야기를 살펴보고 있어요."
                  : latestAssistantMessage || "사진을 보며 떠오르는 이야기를 들려주세요."}
              </p>
              {isRecording && (
                <div className="patient-question-assistant__voice-wave" aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((barIndex) => <span key={barIndex} />)}
                </div>
              )}
            </div>
            {!isProcessing && (
              <div className={`memory-reflection-assistant__agent-actions${isTextMode ? " is-text-mode" : ""}`}>
                {isTextMode ? (
                  <form className="patient-question-assistant__form memory-reflection-assistant__text-form" onSubmit={handleTextSubmit}>
                    <textarea
                      autoFocus
                      value={textDraft}
                      placeholder="떠오르는 이야기를 적어 주세요."
                      onChange={(event) => setTextDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                    />
                    <div>
                      <button type="button" onClick={() => setIsTextMode(false)}>취소</button>
                      <button type="submit" disabled={!textDraft.trim() || isProcessing}>질문하기</button>
                    </div>
                  </form>
                ) : (
                  <>
                  <button type="button" className={`patient-question-assistant__voice-primary-button ${isRecording ? "is-recording" : ""}`} onClick={handleContinue}>
                    <span aria-hidden="true">●</span>
                    {isRecording ? <>말하기<br />끝내기</> : <>말로<br />대화하기</>}
                  </button>
                  <button
                    type="button"
                    className={isRecording ? "patient-question-assistant__voice-cancel-button" : "patient-question-assistant__text-action"}
                    onClick={isRecording ? recorder.cancelRecording : () => setIsTextMode(true)}
                  >
                    {isRecording ? "취소" : <>텍스트로<br />질문하기</>}
                  </button>
                  </>
                )}
              </div>
            )}
          </div>
          {errorMessage && <p className="memory-reflection-assistant__error" role="alert">{errorMessage}</p>}
        </div>
      )}

      {isTextMode && (!hasConversation || isMicrophoneUnavailable) && (
        <form className="patient-question-assistant__form memory-reflection-assistant__text-form" onSubmit={handleTextSubmit}>
          <textarea
            autoFocus
            value={textDraft}
            placeholder="떠오르는 이야기를 적어 주세요."
            onChange={(event) => setTextDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div>
            <button type="button" onClick={() => setIsTextMode(false)}>취소</button>
            <button type="submit" disabled={!textDraft.trim() || isProcessing}>질문하기</button>
          </div>
        </form>
      )}
      </section>
    </VoiceAssistantCard>
  );
}
