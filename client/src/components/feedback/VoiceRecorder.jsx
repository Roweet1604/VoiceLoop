import { useMemo } from "react";
import { Mic, Square, RotateCcw, Trash2, MicOff, PenLine, LoaderCircle, ShieldAlert } from "lucide-react";
import Button from "../ui/Button.jsx";
import Waveform from "../ui/Waveform.jsx";
import { Player } from "./VoiceMessage.jsx";
import { formatDuration } from "../../lib/format.js";
import { VOICE_MAX_SECONDS } from "../../lib/validation.js";

// While recording, the decorative bars change four times a second; with
// reduced motion they stay still.
const BAR_STEP_MS = 250;
const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// The recording part of the public feedback form. `recorder` comes from
// useVoiceRecorder(); `support` from voiceRecordingSupport().
export default function VoiceRecorder({ recorder, support, disabled, onUseText }) {
  const { status, elapsedMs, recording, error, hitLimit, start, stop, discard } = recorder;
  const elapsedSec = elapsedMs / 1000;
  const stillBars = useMemo(prefersReducedMotion, []);

  if (support !== "supported") {
    return (
      <Fallback onUseText={onUseText} Icon={support === "insecure" ? ShieldAlert : MicOff}>
        {support === "insecure"
          ? "Voice recording needs a secure (https) connection, which this page doesn't have."
          : "Voice recording isn't supported in this browser."}
      </Fallback>
    );
  }

  if (status === "error") {
    return (
      <Notice Icon={MicOff} tone="danger" role="alert">
        <p>{error.message}</p>
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
      </Notice>
    );
  }

  if (status === "recorded") {
    return (
      <div className="rounded-card border border-border bg-panel2 p-4">
        <p className="text-sm font-semibold text-text">
          Your recording <span className="font-normal text-muted">· {formatDuration(recording.durationSec)}</span>
        </p>
        {hitLimit && (
          <p className="mt-0.5 text-xs text-muted">Recording stopped at the {VOICE_MAX_SECONDS / 60}-minute limit.</p>
        )}
        {/* Local preview of the customer's own recording; nothing is sent yet. */}
        <div className="mt-3">
          <Player
            url={recording.url}
            seed={recording.url}
            durationSec={recording.durationSec}
            unplayableText="Your browser can't play the preview."
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={discard} disabled={disabled}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Discard
          </Button>
          <Button size="sm" variant="secondary" onClick={start} disabled={disabled}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Record again
          </Button>
        </div>
      </div>
    );
  }

  if (status === "recording") {
    const progress = Math.min(elapsedSec / VOICE_MAX_SECONDS, 1);
    return (
      <div className="rounded-card border border-danger/30 bg-dangerSoft p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-text">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger motion-reduce:animate-none" aria-hidden="true" />
            Recording
          </p>
          <p className="font-mono text-sm tabular-nums text-text" aria-live="off">
            {formatDuration(elapsedSec)} <span className="text-muted">/ {formatDuration(VOICE_MAX_SECONDS)}</span>
          </p>
        </div>
        <Waveform
          seed={stillBars ? "recording" : Math.floor(elapsedMs / BAR_STEP_MS)}
          bars={36}
          tone="accent"
          className="mt-3 w-full justify-between overflow-hidden"
        />
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-label="Recording time used"
          aria-valuemin={0}
          aria-valuemax={VOICE_MAX_SECONDS}
          aria-valuenow={Math.floor(elapsedSec)}
        >
          <div className="h-full bg-danger transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${progress * 100}%` }} />
        </div>
        <Button className="mt-4 h-12 w-full" variant="secondary" onClick={stop}>
          <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          Stop recording
        </Button>
      </div>
    );
  }

  const requesting = status === "requesting";
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-faint/60 px-4 py-6 text-center">
      <button
        type="button"
        onClick={start}
        disabled={disabled || requesting}
        aria-busy={requesting || undefined}
        className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-accent text-onAccent shadow-card ring-8 ring-accent/15 transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none motion-reduce:hover:scale-100"
      >
        {requesting ? (
          <LoaderCircle className="h-7 w-7 animate-spin" aria-hidden="true" />
        ) : (
          <Mic className="h-7 w-7" aria-hidden="true" />
        )}
        <span className="sr-only">{requesting ? "Waiting for microphone…" : "Start recording"}</span>
      </button>
      <p className="mt-4 text-sm font-semibold text-text" aria-hidden="true">
        {requesting ? "Waiting for microphone…" : "Start recording"}
      </p>
      <p className="mt-1 text-xs text-muted">
        Up to {VOICE_MAX_SECONDS / 60} minutes. You can listen to it before sending.
      </p>
      {requesting && (
        <p className="mt-1 text-xs text-muted" role="status">
          Allow microphone access if your browser asks.
        </p>
      )}
    </div>
  );
}

// Styled notice with an icon tile; danger notices tint the icon.
function Notice({ Icon, tone = "neutral", role, children }) {
  return (
    <div className="flex items-start gap-3 rounded-card border border-border bg-panel2 p-4 text-sm text-text" role={role}>
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control ${
          tone === "danger" ? "bg-dangerSoft text-danger" : "bg-panel text-muted"
        }`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 pt-1.5">{children}</div>
    </div>
  );
}

function Fallback({ children, onUseText, Icon }) {
  return (
    <Notice Icon={Icon} role="status">
      <p>{children} You can write your feedback instead.</p>
      <Button size="sm" variant="secondary" className="mt-3" onClick={onUseText}>
        <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
        Write instead
      </Button>
    </Notice>
  );
}

// Shown while a recording uploads.
export function UploadProgress({ value }) {
  const percent = Math.round(value * 100);
  return (
    <div role="status" className="rounded-card border border-border bg-panel2 p-4">
      <div className="flex items-center justify-between text-xs font-semibold text-text">
        <span className="inline-flex items-center gap-1.5">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin text-accentText" aria-hidden="true" />
          {percent < 100 ? "Uploading your recording…" : "Saving…"}
        </span>
        <span className="tabular-nums text-muted">{percent}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-accent transition-[width] duration-150 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
