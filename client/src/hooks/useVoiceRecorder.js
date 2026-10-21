import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_MAX_BYTES, VOICE_MAX_SECONDS } from "../lib/validation.js";

// Formats the server accepts, in order of preference. Chrome, Edge and
// Firefox record WebM/Opus; Safari records MP4/AAC.
const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
const ACCEPTED_BASE_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"];
const MIN_BYTES = 100;

export const baseType = (mimeType) => (mimeType || "").split(";")[0].trim().toLowerCase();

// getUserMedia only exists in secure contexts (https or localhost).
export function voiceRecordingSupport() {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") return "unsupported";
  if (!navigator.mediaDevices?.getUserMedia) return window.isSecureContext ? "unsupported" : "insecure";
  return "supported";
}

function pickMimeType() {
  if (typeof MediaRecorder.isTypeSupported !== "function") return "";
  return PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function permissionError(err) {
  switch (err?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return { kind: "denied", message: "Microphone access was blocked. Allow it in your browser's site settings and try again." };
    case "NotFoundError":
    case "OverconstrainedError":
      return { kind: "no-mic", message: "No microphone was found on this device." };
    case "NotReadableError":
      return { kind: "busy", message: "The microphone is being used by another app. Close it and try again." };
    default:
      return { kind: "failed", message: "Recording couldn't start on this device." };
  }
}

/**
 * Records one voice message with MediaRecorder.
 *
 * status: idle | requesting | recording | recorded | error
 * recording (when "recorded"): { blob, url, mimeType, durationSec, sizeBytes }
 * Recording stops by itself at VOICE_MAX_SECONDS.
 */
export function useVoiceRecorder() {
  const [status, setStatus] = useState("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recording, setRecording] = useState(null);
  const [error, setError] = useState(null);
  const [hitLimit, setHitLimit] = useState(false);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);
  const urlRef = useRef(null);
  const mountedRef = useRef(true);

  const releaseMicrophone = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const revokeUrl = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const discard = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    releaseMicrophone();
    revokeUrl();
    setRecording(null);
    setError(null);
    setHitLimit(false);
    setElapsedMs(0);
    setStatus("idle");
  }, [releaseMicrophone, revokeUrl]);

  const start = useCallback(async () => {
    discard();
    setStatus("requesting");

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      if (!mountedRef.current) return;
      setError(permissionError(err));
      setStatus("error");
      return;
    }
    if (!mountedRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    streamRef.current = stream;

    let recorder;
    try {
      const mimeType = pickMimeType();
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      releaseMicrophone();
      setError({ kind: "failed", message: "This browser can't record audio in a supported format." });
      setStatus("error");
      return;
    }

    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data?.size > 0) chunks.push(e.data);
    };
    recorder.onerror = () => {
      releaseMicrophone();
      setError({ kind: "failed", message: "Recording stopped unexpectedly. Please try again." });
      setStatus("error");
    };
    recorder.onstop = () => {
      const durationSec = Math.min((Date.now() - startedAtRef.current) / 1000, VOICE_MAX_SECONDS);
      releaseMicrophone();
      recorderRef.current = null;
      const mimeType = recorder.mimeType || chunks[0]?.type || "";
      const blob = new Blob(chunks, { type: mimeType });

      let problem = null;
      if (!ACCEPTED_BASE_TYPES.includes(baseType(mimeType))) problem = "This browser records in a format we can't accept.";
      else if (blob.size < MIN_BYTES) problem = "Nothing was recorded. Check your microphone and try again.";
      else if (blob.size > VOICE_MAX_BYTES) problem = "The recording is too large to send. Please record a shorter message.";
      if (problem) {
        setError({ kind: "failed", message: problem });
        setStatus("error");
        return;
      }

      revokeUrl();
      urlRef.current = URL.createObjectURL(blob);
      setRecording({ blob, url: urlRef.current, mimeType, durationSec, sizeBytes: blob.size });
      setElapsedMs(durationSec * 1000);
      setStatus("recorded");
    };

    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    // A timeslice delivers data regularly, so a long recording isn't held
    // in a single buffer until the end.
    recorder.start(1000);
    setStatus("recording");
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      setElapsedMs(Math.min(elapsed, VOICE_MAX_SECONDS * 1000));
      if (elapsed >= VOICE_MAX_SECONDS * 1000) {
        setHitLimit(true);
        stop();
      }
    }, 200);
  }, [discard, releaseMicrophone, revokeUrl, stop]);

  // Release the microphone and the preview URL when the page goes away.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      releaseMicrophone();
      revokeUrl();
    };
  }, [releaseMicrophone, revokeUrl]);

  return { status, elapsedMs, recording, error, hitLimit, start, stop, discard };
}
