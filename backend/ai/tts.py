"""ElevenLabs text-to-speech for EDITH voice replies."""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

from django.conf import settings

logger = logging.getLogger(__name__)

MAX_TTS_CHARS = 2500


def tts_configured() -> bool:
    return bool((settings.ELEVENLABS_API_KEY or "").strip())


def synthesize_speech(text: str) -> bytes:
    """
    Convert plain text to MP3 via ElevenLabs.
    Raises ValueError for bad input; RuntimeError on API failure.
    """
    clean = (text or "").strip()
    if not clean:
        raise ValueError("text is required")
    if len(clean) > MAX_TTS_CHARS:
        clean = clean[: MAX_TTS_CHARS - 1].rsplit(" ", 1)[0] + "…"

    api_key = (settings.ELEVENLABS_API_KEY or "").strip()
    if not api_key:
        raise RuntimeError("ElevenLabs is not configured.")

    voice_id = (settings.ELEVENLABS_VOICE_ID or "XB0fDUnXU5powFXDhCwa").strip()
    model_id = (settings.ELEVENLABS_MODEL_ID or "eleven_multilingual_v2").strip()

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    # Slightly lower stability + light style → natural pauses and less “flat” delivery.
    payload = {
        "text": clean,
        "model_id": model_id,
        "voice_settings": {
            "stability": 0.42,
            "similarity_boost": 0.78,
            "style": 0.35,
            "use_speaker_boost": True,
            "speed": 0.96,
        },
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "xi-api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = (exc.read() or b"").decode("utf-8", errors="replace")[:300]
        except Exception:
            pass
        logger.warning("ElevenLabs TTS error %s: %s", exc.code, detail)
        raise RuntimeError("ElevenLabs TTS failed. Check API key, voice access, and quota.") from exc
    except urllib.error.URLError as exc:
        logger.exception("ElevenLabs TTS request failed")
        raise RuntimeError("Couldn't reach ElevenLabs.") from exc
