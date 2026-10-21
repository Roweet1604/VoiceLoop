// Speech-to-text behind one interface, so a real provider can be added later
// without touching the routes. Every provider implements:
//
//   name          identifier, e.g. "none"
//   isAvailable() true if it can transcribe right now
//   transcribe({ key, mimeType }) -> { text }   (only called when available)
//
// TRANSCRIPTION_PROVIDER picks it. Only "none" exists: it never transcribes
// and never calls an external service, so voice feedback is stored with
// transcriptStatus "unavailable" and no transcript is ever created.

const noneProvider = {
  name: "none",
  isAvailable: () => false,
  async transcribe() {
    throw new Error("Transcription is not available: no speech-to-text provider is configured");
  },
};

const PROVIDERS = { none: noneProvider };

let provider = null;

export function getTranscriber(env = process.env) {
  if (provider) return provider;
  const name = env.TRANSCRIPTION_PROVIDER || "none";
  if (!PROVIDERS[name]) throw new Error(`Unknown TRANSCRIPTION_PROVIDER "${name}" (available: ${Object.keys(PROVIDERS).join(", ")})`);
  provider = PROVIDERS[name];
  return provider;
}

// Status for a newly stored recording. With a real provider this would be
// "processing" and a job would move it to "completed" or "failed".
export function initialTranscriptStatus() {
  return getTranscriber().isAvailable() ? "processing" : "unavailable";
}
