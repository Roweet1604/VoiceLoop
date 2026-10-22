import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, FileText, Play, Pause } from "lucide-react";
import Button from "../ui/Button.jsx";
import Alert from "../ui/Alert.jsx";
import Waveform from "../ui/Waveform.jsx";
import { apiBlob } from "../../lib/api.js";
import { formatBytes, formatDuration } from "../../lib/format.js";

// The recording and transcript of a voice submission on the detail page.
//
// The audio is fetched with the session cookie from the owner-only route and
// played from a local object URL, so it works even when the API is on another
// origin and the file is never reachable through a public address.
export default function VoiceMessage({ feedbackId, audio, transcriptStatus, transcriptText, onAccessError }) {
  const [state, setState] = useState({ status: "loading", url: null, error: null });

  const load = useCallback(() => {
    let url = null;
    let cancelled = false;
    setState({ status: "loading", url: null, error: null });
    apiBlob(`/api/feedback/${encodeURIComponent(feedbackId)}/audio`)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setState({ status: "ready", url, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        onAccessError(err);
        setState({ status: "error", url: null, error: err });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [feedbackId, onAccessError]);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => load(), [load, attempt]);

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-border bg-panel2 p-5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text">
          <Mic className="h-4 w-4 text-accentText" aria-hidden="true" />
          Voice message
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          {audio.durationSec != null && <>About {formatDuration(audio.durationSec)} · </>}
          {formatBytes(audio.sizeBytes)}
        </p>

        <div className="mt-3">
          {state.status === "loading" && (
            <p className="flex items-center gap-2 py-2 text-sm text-muted" role="status">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading recording…
            </p>
          )}
          {state.status === "ready" && <Player url={state.url} seed={feedbackId} durationSec={audio.durationSec} />}
          {state.status === "error" && (
            <Alert>
              <p>{state.error.status === 404 ? "The recording couldn't be found." : state.error.message}</p>
              {state.error.status !== 404 && (
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => setAttempt((n) => n + 1)}>
                  Try again
                </Button>
              )}
            </Alert>
          )}
        </div>
      </div>

      <Transcript status={transcriptStatus} text={transcriptText} />
    </div>
  );
}

// Round play/pause button, the accent waveform as a progress bar, and the
// time. A hidden native <audio> does the playing. An invisible range input
// over the waveform makes it a real slider: click to seek, or focus it and
// use the arrow keys. Also used for the customer's own preview on the
// public form, with its own `unplayableText`.
export function Player({ url, seed, durationSec, unplayableText = "Your browser can't play this recording." }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(durationSec ?? 0);
  const [unplayable, setUnplayable] = useState(false);

  if (unplayable) return <p className="text-sm text-muted">{unplayableText}</p>;

  function togglePlay() {
    const el = audioRef.current;
    if (el.paused) {
      // Only an unsupported format means the recording can't play here; an
      // interrupted or blocked start (AbortError, NotAllowedError) just
      // leaves it paused, so the button can be pressed again.
      el.play().catch((err) => err?.name === "NotSupportedError" && setUnplayable(true));
    } else el.pause();
  }

  return (
    <div className="flex items-center gap-3">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        // Recorded webm often reports Infinity until fully read; keep the
        // stored duration until the browser knows better.
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onError={() => setUnplayable(true)}
      />
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "Pause recording" : "Play recording"}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-onAccent transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {playing ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="ml-0.5 h-5 w-5" aria-hidden="true" />}
      </button>
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-md has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
        <Waveform seed={seed} bars={32} tone="accent" progress={duration ? time / duration : 0} className="w-full justify-between" />
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(time, duration || 0)}
          disabled={!duration}
          onChange={(e) => {
            audioRef.current.currentTime = Number(e.target.value);
            setTime(Number(e.target.value));
          }}
          aria-label="Position in recording"
          aria-valuetext={`${formatDuration(time)} of ${formatDuration(duration)}`}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
        />
      </div>
      <span className="shrink-0 text-xs text-muted tabular-nums">
        {formatDuration(time)} / {formatDuration(duration)}
      </span>
    </div>
  );
}

// Only a completed transcription shows text. Every other state says plainly
// that there is none; nothing is ever filled in.
function Transcript({ status, text }) {
  const messages = {
    unavailable: "Transcription isn't available. No speech-to-text service is set up, so listen to the recording above.",
    processing: "Transcription in progress.",
    failed: "Transcription failed. Listen to the recording above.",
  };
  const completed = status === "completed" && text;

  return (
    <div
      className={`rounded-card px-5 py-4 ${completed ? "border border-border bg-panel2" : "border border-dashed border-faint/60"}`}
    >
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted">
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        Transcript
      </h3>
      {completed ? (
        <>
          <p className="mt-1.5 text-sm whitespace-pre-wrap break-words text-text">{text}</p>
          <p className="mt-1 text-xs text-muted">Generated automatically; it may contain mistakes.</p>
        </>
      ) : (
        <p className="mt-1.5 text-sm text-muted">{messages[status] ?? messages.unavailable}</p>
      )}
    </div>
  );
}
