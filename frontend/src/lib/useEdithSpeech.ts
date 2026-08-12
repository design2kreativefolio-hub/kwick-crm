"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { API_BASE, tokens } from "@/lib/api";

const STORAGE_KEY = "edith-voice-replies";

function readEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Strip markdown / bullets so speech sounds natural — keep punctuation for pauses. */
export function plainForSpeech(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[•\-–]\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ". ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/([.!?])([A-Za-z])/g, "$1 $2")
    .trim();
}

function scoreBritishVoice(v: SpeechSynthesisVoice): number {
  const name = v.name.toLowerCase();
  const lang = v.lang.toLowerCase();
  let score = 0;
  if (lang === "en-gb" || lang.startsWith("en-gb")) score += 100;
  if (lang.includes("gb") || lang.includes("uk")) score += 80;
  if (/google uk english female|uk english female/.test(name)) score += 60;
  if (/\b(hazel|susan|serena|sonia|libby|maisie|charlotte|martha)\b/.test(name)) score += 50;
  if (/british|england|london/.test(name)) score += 40;
  if (/female|woman|zira|samantha|aria|jenny|natasha/.test(name)) score += 15;
  if (v.localService) score += 5;
  if (/en-us|american/.test(lang) || /american|us english/.test(name)) score -= 40;
  if (/\b(david|mark|george|daniel|ryan|guy|male)\b/.test(name)) score -= 25;
  return score;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const ranked = [...voices].sort((a, b) => scoreBritishVoice(b) - scoreBritishVoice(a));
  const best = ranked[0];
  if (best && scoreBritishVoice(best) > 0) return best;

  return voices.find((v) => v.lang.toLowerCase().startsWith("en")) || voices[0] || null;
}

async function fetchElevenLabsAudio(text: string): Promise<Blob | null> {
  const doFetch = async (token: string | null) =>
    fetch(`${API_BASE}/api/ai/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text }),
    });

  let res = await doFetch(tokens.access);
  if (res.status === 401) {
    const refresh = tokens.refresh;
    if (refresh) {
      const refreshed = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
      if (refreshed.ok) {
        const data = await refreshed.json();
        tokens.set(data.access);
        res = await doFetch(data.access);
      }
    }
  }

  if (res.status === 503) return null; // not configured — browser fallback
  if (!res.ok) throw new Error("TTS failed");
  return res.blob();
}

/**
 * EDITH text-to-speech: ElevenLabs when configured, else browser Speech Synthesis.
 */
export function useEdithSpeech() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabledState] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const preferElevenRef = useRef(true);

  const clearAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok = "speechSynthesis" in window || typeof Audio !== "undefined";
    setSupported(ok);
    setEnabledState(ok ? readEnabled() : false);
    if (!("speechSynthesis" in window)) return;

    const loadVoices = () => {
      voiceRef.current = pickVoice();
    };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      window.speechSynthesis.cancel();
      clearAudio();
    };
  }, [clearAudio]);

  const setEnabled = useCallback(
    (on: boolean) => {
      setEnabledState(on);
      try {
        localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
      } catch {
        /* ignore */
      }
      if (!on && typeof window !== "undefined") {
        window.speechSynthesis?.cancel();
        clearAudio();
        setSpeaking(false);
        setPaused(false);
      }
    },
    [clearAudio],
  );

  const stop = useCallback(() => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    clearAudio();
    setSpeaking(false);
    setPaused(false);
  }, [clearAudio]);

  const pause = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setPaused(true);
      return;
    }
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      setPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    if (audioRef.current && audioRef.current.paused) {
      void audioRef.current.play();
      setPaused(false);
      return;
    }
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setPaused(false);
    }
  }, []);

  const speakBrowser = useCallback((clean: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(clean);
    const voice = voiceRef.current || pickVoice();
    if (voice) {
      voiceRef.current = voice;
      utter.voice = voice;
      utter.lang =
        voice.lang.toLowerCase().includes("gb") || voice.lang.toLowerCase().includes("uk")
          ? voice.lang
          : "en-GB";
    } else {
      utter.lang = "en-GB";
    }
    utter.rate = 0.92;
    utter.pitch = 0.95;
    utter.volume = 1;
    utter.onstart = () => {
      setSpeaking(true);
      setPaused(false);
    };
    utter.onend = () => {
      setSpeaking(false);
      setPaused(false);
    };
    utter.onerror = () => {
      setSpeaking(false);
      setPaused(false);
    };
    window.speechSynthesis.speak(utter);
  }, []);

  const speak = useCallback(
    async (text: string, opts?: { force?: boolean }) => {
      if (!enabled && !opts?.force) return;
      const clean = plainForSpeech(text);
      if (!clean) return;

      stop();
      setSpeaking(true);
      setPaused(false);

      if (preferElevenRef.current) {
        try {
          const blob = await fetchElevenLabsAudio(clean);
          if (blob) {
            const url = URL.createObjectURL(blob);
            objectUrlRef.current = url;
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onended = () => {
              clearAudio();
              setSpeaking(false);
              setPaused(false);
            };
            audio.onerror = () => {
              clearAudio();
              setSpeaking(false);
              setPaused(false);
              speakBrowser(clean);
            };
            await audio.play();
            return;
          }
          preferElevenRef.current = false;
        } catch {
          // Fall through to browser TTS
        }
      }

      speakBrowser(clean);
    },
    [enabled, stop, clearAudio, speakBrowser],
  );

  const toggleEnabled = useCallback(() => {
    setEnabled(!enabled);
  }, [enabled, setEnabled]);

  return {
    supported,
    enabled,
    setEnabled,
    toggleEnabled,
    speaking,
    paused,
    speak,
    pause,
    resume,
    stop,
  };
}
