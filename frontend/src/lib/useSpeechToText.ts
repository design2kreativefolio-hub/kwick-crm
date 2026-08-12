"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/**
 * Browser voice-to-text (Web Speech API). Chrome/Edge best; Safari partial;
 * Firefox often unsupported.
 */
export function useSpeechToText(onTranscript: (text: string, isFinal: boolean) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    setSupported(!!getSpeechRecognitionCtor());
  }, []);

  const stop = useCallback(() => {
    const r = recogRef.current;
    if (!r) return;
    try {
      r.onend = null;
      r.stop();
    } catch {
      /* ignore */
    }
    recogRef.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Voice input isn’t supported in this browser. Try Chrome or Edge.");
      return;
    }

    stop();
    setError(null);

    const recog = new Ctor();
    recog.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
    recog.continuous = true;
    recog.interimResults = true;
    recog.maxAlternatives = 1;

    recog.onresult = (event) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript || "";
        if (result.isFinal) finalChunk += text;
        else interimChunk += text;
      }
      if (finalChunk) onTranscriptRef.current(finalChunk, true);
      else if (interimChunk) onTranscriptRef.current(interimChunk, false);
    };

    recog.onerror = (event) => {
      const code = event.error || "";
      if (code === "aborted" || code === "no-speech") return;
      if (code === "not-allowed") {
        setError("Microphone permission denied. Allow mic access and try again.");
      } else {
        setError("Couldn’t capture speech. Check your mic and try again.");
      }
      setListening(false);
      recogRef.current = null;
    };

    recog.onend = () => {
      setListening(false);
      recogRef.current = null;
    };

    try {
      recog.start();
      recogRef.current = recog;
      setListening(true);
    } catch {
      setError("Couldn’t start voice input.");
      setListening(false);
      recogRef.current = null;
    }
  }, [stop]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  useEffect(() => () => stop(), [stop]);

  const clearError = useCallback(() => setError(null), []);

  return { supported, listening, error, start, stop, toggle, clearError };
}
