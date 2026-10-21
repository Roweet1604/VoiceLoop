import { Mic, Square, RotateCcw, Trash2, MicOff, PenLine, LoaderCircle } from "lucide-react";
import Button from "../ui/Button.jsx";
import { formatDuration } from "../../lib/format.js";
import { VOICE_MAX_SECONDS } from "../../lib/validation.js";

// The recording part of the public feedback form. `recorder` comes from
// useVoiceRecorder(); `support` from voiceRecordingSupport().
export default function VoiceRecorder({ recorder, support, disabled, onUseText }) {
  const { status, elapsedMs, recording, error, hitLimit, start, stop, discard } = recorder;
  const elapsedSec = elapsedMs / 1000;

  if (support !== "supported") {
    return (
      <Fallback onUseText={onUseText}>
        {support === "insecure"
          ? "Voice recording needs a secure (https) connection, which this page doesn't have."
          : "Voice recording isn't supported in this browser."}
      </Fallback>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-md border border-border bg-canvas px-4 py-4" role="alert">
        <p className="flex items-start gap-2 text-sm text-ink">
          <MicOff className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          <span>{error.message}</span>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={start} disabled={disabled}>
            <Mic className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </Button>
          <Button size="sm" variant="secondary" onClick={onUseText} disabled={disabled}>
            <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
            Write instead
          </Button>
        </div>
      </div>
    );
  }

  if (status === "recorded") {
    return (
      <div className="rounded-md border border-border bg-canvas px-4 py-4">
        <p className="text-sm font-medium text-ink">
          Your recording <span className="font-normal text-ink-muted">· {formatDuration(recording.durationSec)}</span>
        </p>
        {hitLimit && (
          <p className="mt-0.5 text-xs text-ink-muted">Recording stopped at the {VOICE_MAX_SECONDS / 60}-minute limit.</p>
        )}
        {/* Local preview of the customer's own recording; nothing is sent yet. */}
        <audio controls src={recording.url} className="mt-3 w-full" preload="metadata">
          Your browser can't play the preview.
        </audio>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={start} disabled={disabled}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Record again
          </Button>
          <Button size="sm" variant="secondary" onClick={discard} disabled={disabled}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Discard
          </Button>
        </div>
      </div>
    );
  }

  if (status === "recording") {
    const progress = Math.min(elapsedSec / VOICE_MAX_SECONDS, 1);
    return (
      <div className="rounded-md border border-danger/30 bg-danger-soft/50 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" aria-hidden="true" />
            Recording
          </p>
          <p className="font-mono text-sm tabular-nums text-ink" aria-live="off">
            {formatDuration(elapsedSec)} <span className="text-ink-muted">/ {formatDuration(VOICE_MAX_SECONDS)}</span>
          </p>
        </div>
        <div
          className="mt-3 h-1 overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-label="Recording time used"
          aria-valuemin={0}
          aria-valuemax={VOICE_MAX_SECONDS}
          aria-valuenow={Math.floor(elapsedSec)}
        >
          <div className="h-full bg-danger transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
        </div>
        <Button className="mt-4 w-full" variant="secondary" onClick={stop}>
          <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          Stop recording
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-dashed border-border-strong bg-canvas px-4 py-5 text-center">
      <Button onClick={start} loading={status === "requesting"} disabled={disabled}>
        {status !== "requesting" && <Mic className="h-4 w-4" aria-hidden="true" />}
        {status === "requesting" ? "Waiting for microphone…" : "Start recording"}
      </Button>
      <p className="mt-2 text-xs text-ink-muted">
        Up to {VOICE_MAX_SECONDS / 60} minutes. You can listen to it before sending.
      </p>
      {status === "requesting" && (
        <p className="mt-1 text-xs text-ink-muted" role="status">
          Allow microphone access if your browser asks.
        </p>
      )}
    </div>
  );
}

function Fallback({ children, onUseText }) {
  return (
    <div className="rounded-md border border-border bg-canvas px-4 py-4" role="status">
      <p className="flex items-start gap-2 text-sm text-ink">
        <MicOff className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
        <span>{children} You can write your feedback instead.</span>
      </p>
      <Button size="sm" variant="secondary" className="mt-3" onClick={onUseText}>
        <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
        Write instead
      </Button>
    </div>
  );
}

// Shown while a recording uploads.
export function UploadProgress({ value }) {
  const percent = Math.round(value * 100);
  return (
    <div role="status">
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {percent < 100 ? "Uploading your recording…" : "Saving…"}
        </span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border">
        <div className="h-full bg-accent transition-[width] duration-150" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
