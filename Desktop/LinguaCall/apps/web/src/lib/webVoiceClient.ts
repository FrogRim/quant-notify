import type {
  CompleteWebVoiceCallPayload,
  StartCallResponse,
  WebVoiceRuntimeEventPayload,
  WebVoiceTranscriptSegment
} from "@lingua/shared";

export type WebVoiceClientState =
  | "requesting_permission"
  | "connecting"
  | "live"
  | "ending"
  | "ended"
  | "failed";

export type WebVoiceClientController = {
  end: (endReason?: string) => Promise<void>;
  getTranscript: () => WebVoiceTranscriptSegment[];
};

type StartWebVoiceClientOptions = {
  apiBase: string;
  bootstrap: StartCallResponse;
  headers: Record<string, string>;
  onStateChange?: (state: WebVoiceClientState, message?: string) => void;
  onTranscriptChange?: (transcript: WebVoiceTranscriptSegment[]) => void;
};

const postJson = async <T>(
  apiBase: string,
  path: string,
  headers: Record<string, string>,
  body: object
): Promise<T> => {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json() as { ok: boolean; data?: T; error?: { message?: string } };
  if (!payload.ok || payload.data === undefined) {
    throw new Error(payload.error?.message ?? "request_failed");
  }
  return payload.data;
};

const notifyRuntimeEvent = (
  apiBase: string,
  sessionId: string,
  headers: Record<string, string>,
  payload: WebVoiceRuntimeEventPayload
) => postJson(apiBase, `/calls/${sessionId}/runtime-event`, headers, payload);

const completeRuntime = (
  apiBase: string,
  sessionId: string,
  headers: Record<string, string>,
  payload: CompleteWebVoiceCallPayload
) => postJson(apiBase, `/calls/${sessionId}/runtime-complete`, headers, payload);

const pushTranscript = (
  transcript: WebVoiceTranscriptSegment[],
  segment: WebVoiceTranscriptSegment,
  onTranscriptChange?: (transcript: WebVoiceTranscriptSegment[]) => void
) => {
  transcript.push(segment);
  onTranscriptChange?.([...transcript]);
};

const readRealtimeTextParts = (value: unknown): string => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (!Array.isArray(value)) {
    return "";
  }
  return value
    .flatMap((part) => {
      if (!part || typeof part !== "object") {
        return [];
      }
      const candidate = part as {
        transcript?: unknown;
        text?: unknown;
        content?: unknown;
      };
      const nested = readRealtimeTextParts(candidate.content);
      return [candidate.transcript, candidate.text, nested]
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim());
    })
    .join(" ")
    .trim();
};

const getAssistantRealtimeKey = (payload: Record<string, unknown>): string =>
  String(payload.response_id ?? payload.item_id ?? "assistant");

const normalizeTranscriptForQualityCheck = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const isLowQualityTranscript = (value: string): boolean => {
  const normalized = normalizeTranscriptForQualityCheck(value);
  if (!normalized) {
    return true;
  }

  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }
  if (tokens.length === 1 && tokens[0]!.length <= 2) {
    return true;
  }

  const fillerTokens = new Set([
    "uh",
    "um",
    "mm",
    "hmm",
    "ah",
    "eh",
    "er",
    "hm",
    "uhh",
    "umm"
  ]);
  const stretchedFillerLike = /^(u+h+|u+m+|m+m+|h+m+m+|a+h+|e+h+|e+r+)$/u;
  if (tokens.every((token) => fillerTokens.has(token) || stretchedFillerLike.test(token))) {
    return true;
  }

  const uniqueTokens = new Set(tokens);
  if (tokens.length >= 3 && uniqueTokens.size === 1) {
    return true;
  }

  return false;
};

const getResponseDelayMs = (value: string): number => {
  const normalized = normalizeTranscriptForQualityCheck(value);
  const tokenCount = normalized ? normalized.split(" ").filter(Boolean).length : 0;
  if (tokenCount <= 3) {
    return 650;
  }
  if (tokenCount <= 8) {
    return 350;
  }
  return 150;
};

const getTargetLanguageDisplay = (language: string): string => {
  switch (language) {
    case "de":
      return "German";
    case "zh":
      return "Mandarin Chinese";
    case "es":
      return "Spanish";
    case "ja":
      return "Japanese";
    case "fr":
      return "French";
    case "en":
    default:
      return "English";
  }
};

const buildPreferredAudioConstraints = (): MediaTrackConstraints => ({
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: { ideal: 48_000 },
  sampleSize: { ideal: 16 }
});

const requestMicrophoneStream = async (): Promise<MediaStream> => {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: buildPreferredAudioConstraints()
    });
  } catch (error) {
    const shouldFallback =
      error instanceof DOMException &&
      (error.name === "OverconstrainedError" || error.name === "TypeError");

    if (!shouldFallback) {
      throw error;
    }

    return navigator.mediaDevices.getUserMedia({ audio: true });
  }
};

export const startWebVoiceClient = async ({
  apiBase,
  bootstrap,
  headers,
  onStateChange,
  onTranscriptChange
}: StartWebVoiceClientOptions): Promise<WebVoiceClientController> => {
  onStateChange?.("requesting_permission", "Requesting microphone access...");
  let stream: MediaStream;
  try {
    stream = await requestMicrophoneStream();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "microphone_permission_denied";
    await notifyRuntimeEvent(apiBase, bootstrap.sessionId, headers, {
      event: "permission_denied",
      detail
    }).catch(() => undefined);
    await completeRuntime(apiBase, bootstrap.sessionId, headers, {
      endReason: "permission_denied",
      endedAt: new Date().toISOString(),
      failureReason: "mic_permission_denied",
      userTurns: 0,
      assistantTurns: 0,
      transcript: []
    }).catch(() => undefined);
    onStateChange?.("failed", "Microphone access was denied.");
    throw error;
  }

  const peer = new RTCPeerConnection();
  const remoteAudio = document.createElement("audio");
  remoteAudio.autoplay = true;
  remoteAudio.style.display = "none";
  document.body.appendChild(remoteAudio);

  const transcript: WebVoiceTranscriptSegment[] = [];
  const assistantBuffers = new Map<string, string>();
  const finalizedAssistantKeys = new Set<string>();
  let finalized = false;
  let connectedAt: string | undefined;
  let pendingResponseTimer: ReturnType<typeof setTimeout> | null = null;
  let assistantTurnCount = 0;

  const clearPendingResponseTimer = () => {
    if (pendingResponseTimer) {
      clearTimeout(pendingResponseTimer);
      pendingResponseTimer = null;
    }
  };

  const queueAssistantResponse = (userTranscript: string) => {
    clearPendingResponseTimer();
    const delayMs = getResponseDelayMs(userTranscript);
    pendingResponseTimer = setTimeout(() => {
      pendingResponseTimer = null;
      const targetLanguage = getTargetLanguageDisplay(bootstrap.language);
      try {
        dataChannel.send(JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["audio", "text"],
            instructions:
              assistantTurnCount === 0
                ? `This is your first reply in the session. Speak only in ${targetLanguage}. Give a brief greeting, confirm the topic "${bootstrap.topic}" naturally, and ask one easy follow-up question that fits ${bootstrap.level} level. Keep it to at most two short sentences.`
                : `Continue the conversation naturally in ${targetLanguage} about "${bootstrap.topic}". Match approximately ${bootstrap.level} difficulty. Do not spend the full turn on correction. If you correct, keep it to one brief sentence and then continue with one follow-up question.`
          }
        }));
      } catch {
        // best effort only
      }
    }, delayMs);
  };

  const finalize = async (payload: CompleteWebVoiceCallPayload, nextState: WebVoiceClientState) => {
    if (finalized) {
      return;
    }
    finalized = true;
    clearPendingResponseTimer();
    onStateChange?.("ending", "Finishing live session...");
    let completionFailed = false;
    try {
      await completeRuntime(apiBase, bootstrap.sessionId, headers, {
        ...payload,
        userTurns: transcript.filter((segment) => segment.role === "user").length,
        assistantTurns: transcript.filter((segment) => segment.role === "assistant").length,
        validationHints: {
          transcriptCount: transcript.length
        },
        transcript: [...transcript]
      });
    } catch {
      completionFailed = true;
    } finally {
      onStateChange?.(
        nextState,
        completionFailed
          ? nextState === "ended"
            ? "Live session ended locally. Server sync may still be catching up."
            : "Live session failed. Server sync may still be catching up."
          : nextState === "ended"
            ? "Live session ended."
            : "Live session failed."
      );
      stream.getTracks().forEach((track) => track.stop());
      peer.close();
      remoteAudio.remove();
    }
  };

  const dataChannel = peer.createDataChannel("oai-events");
  dataChannel.addEventListener("open", async () => {
    connectedAt = new Date().toISOString();
    onStateChange?.("live", "Live session connected.");
    await notifyRuntimeEvent(apiBase, bootstrap.sessionId, headers, { event: "connected" }).catch(() => undefined);
  });

  dataChannel.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as Record<string, unknown>;
      const eventType = String(payload.type ?? "");
      const finalizeAssistantTurn = (key: string, value: string) => {
        const finalText = value.trim();
        if (!finalText || finalizedAssistantKeys.has(key)) {
          return;
        }

        finalizedAssistantKeys.add(key);
        assistantBuffers.delete(key);
        assistantTurnCount += 1;
        pushTranscript(
          transcript,
          {
            role: "assistant",
            content: finalText,
            timestampMs: connectedAt ? Math.max(0, Date.now() - Date.parse(connectedAt)) : null,
            isFinal: true
          },
          onTranscriptChange
        );
      };

      if (eventType === "input_audio_buffer.speech_started") {
        clearPendingResponseTimer();
        return;
      }

      if (eventType === "conversation.item.input_audio_transcription.completed") {
        const transcriptText = String(payload.transcript ?? "").trim();
        if (transcriptText) {
          if (isLowQualityTranscript(transcriptText)) {
            void notifyRuntimeEvent(apiBase, bootstrap.sessionId, headers, {
              event: "transcript_filtered",
              detail: `low_quality_transcript:${transcriptText.length}`
            }).catch(() => undefined);
            onStateChange?.("live", "Listening for a clearer utterance...");
            return;
          }

          pushTranscript(
            transcript,
            {
              role: "user",
              content: transcriptText,
              timestampMs: connectedAt ? Math.max(0, Date.now() - Date.parse(connectedAt)) : null,
              isFinal: true
            },
            onTranscriptChange
          );
          queueAssistantResponse(transcriptText);
        }
        return;
      }

      if (eventType === "response.audio_transcript.delta") {
        const key = getAssistantRealtimeKey(payload);
        const delta = String(payload.delta ?? "");
        assistantBuffers.set(key, `${assistantBuffers.get(key) ?? ""}${delta}`);
        return;
      }

      if (eventType === "response.output_text.delta") {
        const key = getAssistantRealtimeKey(payload);
        const delta = String(payload.delta ?? "");
        assistantBuffers.set(key, `${assistantBuffers.get(key) ?? ""}${delta}`);
        return;
      }

      if (eventType === "response.output_item.done") {
        const key = getAssistantRealtimeKey(payload);
        const itemText = readRealtimeTextParts(payload.item ?? payload.content ?? payload.output);
        if (itemText) {
          assistantBuffers.set(key, itemText);
        }
        return;
      }

      if (eventType === "response.audio_transcript.done" || eventType === "response.output_text.done") {
        const key = getAssistantRealtimeKey(payload);
        const finalText = String(
          payload.transcript ??
          payload.text ??
          readRealtimeTextParts(payload.content ?? payload.output) ??
          assistantBuffers.get(key) ??
          ""
        ).trim();
        finalizeAssistantTurn(key, finalText);
        return;
      }

      if (eventType === "response.done") {
        const responsePayload = payload.response as Record<string, unknown> | undefined;
        const key = String(responsePayload?.id ?? payload.response_id ?? "assistant");
        const finalText = String(
          readRealtimeTextParts(responsePayload?.output ?? responsePayload?.content) ??
          assistantBuffers.get(key) ??
          ""
        ).trim();
        finalizeAssistantTurn(key, finalText);
      }
    } catch {
      // ignore malformed runtime event
    }
  });

  peer.addEventListener("track", (event) => {
    remoteAudio.srcObject = event.streams[0];
  });

  peer.addEventListener("connectionstatechange", () => {
    const state = peer.connectionState;
    if (state === "connecting") {
      onStateChange?.("connecting", "Connecting live audio...");
      void notifyRuntimeEvent(apiBase, bootstrap.sessionId, headers, { event: "connecting", connectionState: state }).catch(() => undefined);
      return;
    }
    if (state === "failed") {
      void notifyRuntimeEvent(apiBase, bootstrap.sessionId, headers, { event: "media_error", connectionState: state }).catch(() => undefined);
      void finalize(
        {
          endReason: "connection_failed",
          endedAt: new Date().toISOString(),
          failureReason: "media_connection_failed"
        },
        "failed"
      );
      return;
    }
    if (state === "disconnected") {
      void notifyRuntimeEvent(apiBase, bootstrap.sessionId, headers, { event: "network_error", connectionState: state }).catch(() => undefined);
      void finalize(
        {
          endReason: "connection_disconnected",
          endedAt: new Date().toISOString(),
          failureReason: "network_error"
        },
        "failed"
      );
    }
  });

  stream.getTracks().forEach((track) => {
    peer.addTrack(track, stream);
  });

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);

  try {
    const sdpResponse = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(bootstrap.model)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bootstrap.clientSecret}`,
        "Content-Type": "application/sdp"
      },
      body: offer.sdp ?? ""
    });

    if (!sdpResponse.ok) {
      throw new Error(`realtime_sdp_failed:${sdpResponse.status}`);
    }

    const answer = await sdpResponse.text();
    await peer.setRemoteDescription({ type: "answer", sdp: answer });
  } catch (error) {
    await notifyRuntimeEvent(apiBase, bootstrap.sessionId, headers, {
      event: "media_error",
      detail: error instanceof Error ? error.message : "sdp_failed"
    }).catch(() => undefined);
    await finalize(
      {
        endReason: "bootstrap_failed",
        endedAt: new Date().toISOString(),
        failureReason: "media_connection_failed"
      },
      "failed"
    );
    throw error;
  }

  return {
    end: async (endReason = "user_ended") => {
      await notifyRuntimeEvent(apiBase, bootstrap.sessionId, headers, {
        event: "participant_left",
        detail: endReason
      }).catch(() => undefined);
      await finalize(
        {
          endReason,
          startedAt: connectedAt,
          endedAt: new Date().toISOString()
        },
        "ended"
      );
    },
    getTranscript: () => [...transcript]
  };
};
