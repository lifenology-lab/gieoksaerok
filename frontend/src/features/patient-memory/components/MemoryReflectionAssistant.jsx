import { useEffect, useState } from "react";

import usePatientQuestionRecorder from "@/features/patient-questions/hooks/usePatientQuestionRecorder";

import { requestMemoryReflectionAudio } from "../api/patientMemoryApi";

import "./MemoryReflectionAssistant.css";

const MAX_VISIBLE_MESSAGES = 6;

export default function MemoryReflectionAssistant({
  reflectionItem,
  session,
  onSessionChange,
  onClose,
}) {
  const [isReplyLoading, setIsReplyLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const messages = session?.messages || [];
  const summary = session?.summary || "";

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
      const nextTranscript = result.transcript?.trim();

      if (!nextTranscript) {
        throw new Error("말씀하신 내용을 확인하지 못했어요. 다시 말씀해 주세요.");
      }

      const nextMessages = [
        ...messages,
        { role: "user", content: nextTranscript },
      ].slice(-MAX_VISIBLE_MESSAGES);

      const reply = result.reply || "이야기를 함께 들었어요.";

      onSessionChange({
        messages: [
          ...nextMessages,
          { role: "assistant", content: reply },
        ].slice(-MAX_VISIBLE_MESSAGES),
        summary: result.summary || summary,
        lastActiveAt: Date.now(),
      });
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
  const hasConversation = messages.length > 0;

  const title = isPreparing
    ? "마이크를 켜고 있어요"
    : isRecording
      ? "이제 말씀해 주세요"
      : isProcessing
        ? "말씀을 확인하고 있어요"
        : "떠오르는 이야기를 들려주세요";
  const description = isPreparing
    ? "준비가 끝날 때까지 잠시만 기다려 주세요."
    : isRecording
      ? "파형이 움직이면 사진을 보며 천천히 말씀해 주세요."
      : isProcessing
        ? "전사와 답변을 준비하는 동안 잠시 기다려 주세요."
        : "기억나는 것을 편하게 이야기해 주세요.";

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

  return (
    <section
      className={`memory-reflection-assistant ${isRecording ? "is-recording" : ""}`}
      aria-live="polite"
    >
      <div className="memory-reflection-assistant__heading">
        <div>
          <span aria-hidden="true">●</span>
          <div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
        </div>
        <button type="button" disabled={isProcessing} onClick={handleClose}>대화 닫기</button>
      </div>

      {!hasConversation && (
        <div className="memory-reflection-assistant__recording">
          {isRecording && (
            <div className="memory-reflection-assistant__voice-wave" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5, 6].map((barIndex) => <span key={barIndex} />)}
            </div>
          )}
          {isPreparing || isProcessing ? (
            <div className="memory-reflection-assistant__status" aria-live="polite">
              {isPreparing ? "마이크를 준비하고 있어요" : "말씀을 확인하고 있어요"}
            </div>
          ) : (
            <button
              type="button"
              onClick={isRecording ? recorder.stopRecording : recorder.startRecording}
            >
              {isRecording ? "말하기 끝내기" : "말로 이야기하기"}
            </button>
          )}
          <p>{recorder.statusMessage || "말씀을 마치고 잠시 기다리면 자동으로 끝나요."}</p>
        </div>
      )}

      {recorder.errorMessage && <p className="memory-reflection-assistant__error" role="alert">{recorder.errorMessage}</p>}

      {hasConversation && (
        <div className="memory-reflection-assistant__conversation">
          {messages.map((message, index) => (
            <p
              key={`${message.role}-${index}-${message.content}`}
              className={`memory-reflection-assistant__message is-${message.role}`}
            >
              <span>{message.role === "user" ? "내 이야기" : "새록이"}</span>
              {message.role === "user" ? `“${message.content}”` : message.content}
            </p>
          ))}
          {isProcessing && <p className="memory-reflection-assistant__loading">새록이가 이야기를 듣고 있어요.</p>}
          {errorMessage && <p className="memory-reflection-assistant__error" role="alert">{errorMessage}</p>}
          {isRecording && (
            <div className="memory-reflection-assistant__voice-wave" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5, 6].map((barIndex) => <span key={barIndex} />)}
            </div>
          )}
          {isProcessing ? (
            <div className="memory-reflection-assistant__status" aria-live="polite">
              말씀을 확인하고 있어요
            </div>
          ) : (
            <button type="button" onClick={handleContinue}>
              {isRecording ? "말하기 끝내기" : "더 이야기하기"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
