import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Mic, FileText } from "lucide-react";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import Alert from "../ui/Alert.jsx";
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
    <Card>
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Mic className="h-4 w-4 text-accent" aria-hidden="true" />
        Voice message
      </h2>
      <p className="mt-0.5 text-xs text-ink-muted">
        {audio.durationSec != null && <>About {formatDuration(audio.durationSec)} · </>}
        {formatBytes(audio.sizeBytes)}
      </p>

      <div className="mt-3">
        {state.status === "loading" && (
          <p className="flex items-center gap-2 py-2 text-sm text-ink-muted" role="status">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading recording…
          </p>
        )}
        {state.status === "ready" && (
          <audio controls src={state.url} className="w-full" preload="metadata">
            Your browser can't play this recording.
          </audio>
        )}
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

      <Transcript status={transcriptStatus} text={transcriptText} />
    </Card>
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

  return (
    <div className="mt-4 border-t border-border pt-3">
      <h3 className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        Transcript
      </h3>
      {status === "completed" && text ? (
        <>
          <p className="mt-1.5 text-sm whitespace-pre-wrap break-words text-ink">{text}</p>
          <p className="mt-1 text-xs text-ink-muted">Generated automatically; it may contain mistakes.</p>
        </>
      ) : (
        <p className="mt-1.5 text-sm text-ink-muted">{messages[status] ?? messages.unavailable}</p>
      )}
    </div>
  );
}
