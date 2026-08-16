import { useEffect, useState } from "react";

import { requestPatientAnswerSpeech } from "@/features/patient-questions/api/patientAnswerSpeechApi";
import usePatientQuestionRecorder from "@/features/patient-questions/hooks/usePatientQuestionRecorder";
import VoiceAssistantCard from "@/shared/components/VoiceAssistantCard";
import { createTtsSpeechRequest } from "@/shared/speech/createSpeechRequest";
import useSpeechPlayback from "@/shared/speech/useSpeechPlayback";
import "@/features/patient-questions/components/PatientQuestionAssistant.css";

import {
  requestMemoryReflectionAudio,
  requestMemoryReflectionText,
} from "../api/patientMemoryApi";
import { createMemoryReflectionSpeechText } from "../utils/createMemoryReflectionSpeechText";

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
  const [pendingTranscript, setPendingTranscript] = useState("");
  const messages = session?.messages || [];
  const summary = session?.summary || "";
  const {
    errorMessage: speechErrorMessage,
    play: playSpeech,
    status: speechStatus,
    stop: stopSpeech,
  } = useSpeechPlayback({ requestTts: requestPatientAnswerSpeech });

  const updateConversation = (result, source) => {
    const nextTranscript = result.transcript?.trim();

    if (!nextTranscript) {
      throw new Error("말씀하신 내용을 확인하지 못했어요. 다시 말씀해 주세요.");
    }

    const nextMessages = [
      ...messages,
      { role: "user", content: nextTranscript, source },
    ].slice(-MAX_VISIBLE_MESSAGES);

    const assistantReply = result.reply || "이야기를 함께 들었어요.";

    onSessionChange({
      messages: [
        ...nextMessages,
        { role: "assistant", content: assistantReply },
      ].slice(-MAX_VISIBLE_MESSAGES),
      summary: result.summary || summary,
      lastActiveAt: Date.now(),
    });

    void playSpeech(
      createTtsSpeechRequest(createMemoryReflectionSpeechText(assistantReply)),
    );
  };

  const handleAudio = async ({ audioBlob }) => {
    stopSpeech();
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
  const hasConversationView = hasConversation || Boolean(pendingTranscript);
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const latestAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant")?.content;
  const isMicrophonePermissionError = /마이크.*(?:허용|권한)|NotAllowedError/i.test(
    recorder.errorMessage || "",
  );
  const isReplyPreparing = isReplyLoading;

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
    stopSpeech();
    onClose();
  };

  const handleContinue = () => {
    stopSpeech();
    setErrorMessage("");
    recorder.startRecording();
  };

  const handleTextSubmit = async (event) => {
    event.preventDefault();

    const transcript = textDraft.trim();
    if (!transcript || isProcessing) {
      return;
    }

    stopSpeech();
    setErrorMessage("");
    setPendingTranscript(transcript);
    setIsTextMode(false);
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
      setPendingTranscript("");
    } catch (error) {
      setErrorMessage(error.message || "이야기에 답하지 못했어요.");
    } finally {
      setIsReplyLoading(false);
    }
  };

  const reflectionSpeechText = createMemoryReflectionSpeechText(
    latestAssistantMessage,
  );
  const speechActionLabel =
    speechStatus === "loading"
      ? "안내를 준비하고 있어요"
      : speechStatus === "playing"
        ? "안내를 들려드리고 있어요"
        : "다시 듣기";

  const handleReplayAssistantReply = () => {
    if (speechStatus === "playing") {
      stopSpeech();
      return;
    }

    void playSpeech(createTtsSpeechRequest(reflectionSpeechText));
  };

  return (
    <VoiceAssistantCard
      className={`patient-question-assistant memory-reflection-assistant-shell${hasConversationView ? " is-conversation" : ""}`}
      ariaLabelledBy="memory-reflection-assistant-title"
      closeLabel="회상 대화 닫기"
      onClose={handleClose}
      isEmbedded={isEmbedded}
    >
      <section
        className={`memory-reflection-assistant ${isRecording ? "is-recording" : ""}`}
        aria-live="polite"
      >
      {!hasConversationView && !isTextMode && (
        <div className={`patient-question-assistant__heading ${isRecording ? "is-recording" : ""}`}>
          <span aria-hidden="true">●</span>
          <div>
            <h2 id="memory-reflection-assistant-title">{title}</h2>
            <p>{description}</p>
          </div>
        </div>
      )}

      {!hasConversationView && !isMicrophoneUnavailable && (
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

      {isMicrophoneUnavailable && !isTextMode && !hasConversationView && (
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

      {hasConversationView && (
        <div className={`memory-reflection-assistant__conversation${isProcessing ? " is-processing" : ""}`}>
          {isProcessing && (
            <div className="memory-reflection-assistant__status" aria-live="polite">
              <span>
                {isReplyPreparing
                  ? "새록이가 답변을 준비하고 있어요"
                  : "말씀을 확인하고 있어요"}
              </span>
            </div>
          )}
          <div className={`memory-reflection-assistant__agent-layout${isProcessing ? " is-processing" : ""}`}>
            <div className="memory-reflection-assistant__response" aria-label="새록이의 회상 안내">
              {(pendingTranscript || latestUserMessage) && (
                <div className="memory-reflection-assistant__transcript">
                  <span>{(pendingTranscript || latestUserMessage?.source === "text") ? "이렇게 남겼어요" : "이렇게 들었어요"}</span>
                  <p>“{pendingTranscript || latestUserMessage?.content}”</p>
                  {!pendingTranscript && latestUserMessage?.source !== "text" && !isProcessing && !isRecording && (
                    <button type="button" onClick={handleContinue}>다시 말하기</button>
                  )}
                </div>
              )}
              <p className="memory-reflection-assistant__answer">
                {isProcessing
                  ? isReplyPreparing
                    ? "남겨주신 이야기를 바탕으로 답을 준비하고 있어요."
                    : "말씀을 확인하고 있어요."
                  : latestAssistantMessage || "사진을 보며 떠오르는 이야기를 들려주세요."}
              </p>
              {!isProcessing && reflectionSpeechText && (
                <button
                  type="button"
                  className={`patient-question-assistant__speech-action ${speechStatus === "playing" ? "is-playing" : ""}`}
                  disabled={speechStatus === "loading"}
                  aria-pressed={speechStatus === "playing"}
                  aria-label={
                    speechStatus === "playing"
                      ? "안내 재생을 멈추기"
                      : speechActionLabel
                  }
                  onClick={handleReplayAssistantReply}
                >
                  <span
                    className="patient-question-assistant__speech-wave"
                    aria-hidden="true"
                  >
                    {[0, 1, 2, 3].map((barIndex) => (
                      <i key={barIndex} />
                    ))}
                  </span>
                  {speechActionLabel}
                </button>
              )}
              {speechErrorMessage && (
                <p className="patient-question-assistant__speech-error" role="alert">
                  {speechErrorMessage}
                </p>
              )}
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
                      <button type="submit" disabled={!textDraft.trim() || isProcessing}>이야기 나누기</button>
                    </div>
                  </form>
                ) : isMicrophoneUnavailable ? (
                  <button
                    type="button"
                    className="patient-question-assistant__text-action"
                    onClick={() => setIsTextMode(true)}
                  >
                    텍스트로<br />이야기하기
                  </button>
                ) : (
                  <>
                  <button
                    type="button"
                    className={`patient-question-assistant__voice-primary-button ${isRecording ? "is-recording" : ""}`}
                    onClick={isRecording ? recorder.stopRecording : handleContinue}
                  >
                    <span aria-hidden="true">●</span>
                    {isRecording ? <>말하기<br />끝내기</> : <>말로<br />대화하기</>}
                  </button>
                  <button
                    type="button"
                    className={isRecording ? "patient-question-assistant__voice-cancel-button" : "patient-question-assistant__text-action"}
                    onClick={isRecording ? recorder.cancelRecording : () => setIsTextMode(true)}
                  >
                    {isRecording ? "취소" : <>텍스트로<br />이야기하기</>}
                  </button>
                  </>
                )}
              </div>
            )}
          </div>
          {errorMessage && <p className="memory-reflection-assistant__error" role="alert">{errorMessage}</p>}
        </div>
      )}

      {isTextMode && (!hasConversationView || isMicrophoneUnavailable) && (
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
            <button type="submit" disabled={!textDraft.trim() || isProcessing}>이야기 나누기</button>
          </div>
        </form>
      )}
      </section>
    </VoiceAssistantCard>
  );
}
