"""LLM-powered reasoning for multi-agent conversations.

Provides an ``LLMReasoner`` class that generates agent statements using
either a local Ollama instance or the Google Gemini API.  Falls back to
template-based generation when no LLM backend is available.

Usage (inside ``MultiAgentSession``)::

    reasoner = LLMReasoner()          # auto-detects Ollama / Gemini
    statement = await reasoner.generate_statement(
        agent_id="alpha",
        personality=agent.personality.as_dict(),
        mood=agent.emotion.current_mood,
        memory_context={...},
        topic="object features ...",
        previous_statement="...",
        mode="collaborate",
    )
    # statement is ``None`` when no LLM is reachable → caller uses templates
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

# ── defaults ──────────────────────────────────────────────────────────────

_OLLAMA_URL = os.getenv("OLLAMA_URL", "https://ollama.com" if os.getenv("OLLAMA_API_KEY") else "http://localhost:11434")
_OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gpt-oss:120b" if os.getenv("OLLAMA_API_KEY") else "llama3.2")
_OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "")

_GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

# Timeout for LLM requests (seconds) – keep short so training isn't blocked
_LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "30" if os.getenv("OLLAMA_API_KEY") else "8"))

# ── prompt helpers ────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are role-playing as an AI agent in a multi-agent language emergence \
simulation.  Your responses must stay in character.

Rules:
- Speak in first person as the agent.
- Keep statements concise (1-3 sentences).
- Reference your personality traits, mood, and past experiences when relevant.
- Match the conversation mode (debate → challenge others; collaborate → build \
on ideas; social → casual exchange).
- Do NOT break character or mention that you are an AI language model.
- Do NOT use emojis or markdown formatting.
"""


def _build_prompt(
    agent_id: str,
    personality: Dict[str, float],
    mood: str,
    memory_context: Dict[str, Any],
    mode: str,
    topic: Optional[str] = None,
    previous_statement: Optional[str] = None,
) -> str:
    """Build a user-role prompt describing the agent's situation."""

    dominant = max(personality, key=personality.get)  # type: ignore[arg-type]

    parts: List[str] = [
        f"You are agent '{agent_id}'.",
        f"Your dominant personality trait is {dominant} "
        f"(score {personality[dominant]:.2f}).",
        f"Full personality: {json.dumps(personality)}.",
        f"Your current mood: {mood}.",
    ]

    # Memory context
    preferred = memory_context.get("preferred_symbols", [])
    if preferred:
        sym_str = ", ".join(
            f"sym-{s['symbol']} ({s['count']} uses)" for s in preferred[:3]
        )
        parts.append(f"Your most-used symbols: {sym_str}.")

    trust = memory_context.get("trust", None)
    if trust is not None:
        parts.append(f"Trust in conversation partner: {trust:.2f}.")

    success_rate = memory_context.get("success_rate", None)
    if success_rate is not None:
        parts.append(f"Recent success rate: {success_rate:.0%}.")

    streak = memory_context.get("streak", 0)
    if streak > 0:
        parts.append(f"You are on a {streak}-win streak.")
    elif streak < 0:
        parts.append(f"You are on a {abs(streak)}-loss streak.")

    # Conversation context
    parts.append(f"Conversation mode: {mode}.")

    if topic:
        parts.append(f"Discussion topic: {topic}.")

    if previous_statement:
        parts.append(f"The previous agent said: \"{previous_statement}\"")
        parts.append("Respond to or build on what was just said.")
    else:
        parts.append("You are starting the conversation. Make an opening statement.")

    parts.append(
        "Generate your statement now (1-3 sentences, in character, no emojis):"
    )

    return "\n".join(parts)


# ── LLMReasoner ──────────────────────────────────────────────────────────

class LLMReasoner:
    """Async LLM client that tries Ollama then Gemini, with template fallback.

    Call ``generate_statement()`` from ``MultiAgentSession``.  Returns
    ``None`` when no LLM backend is reachable so the caller can fall back
    to its existing template logic.

    Availability is cached after the first probe so that repeated calls
    don't retry unreachable backends every time.
    """

    def __init__(
        self,
        ollama_url: str = _OLLAMA_URL,
        ollama_model: str = _OLLAMA_MODEL,
        ollama_api_key: str = _OLLAMA_API_KEY,
        gemini_api_key: str = _GEMINI_API_KEY,
        gemini_model: str = _GEMINI_MODEL,
        timeout: float = _LLM_TIMEOUT,
    ):
        self.ollama_url = ollama_url.rstrip("/")
        self.ollama_model = ollama_model
        self.ollama_api_key = ollama_api_key
        self.gemini_api_key = gemini_api_key
        self.gemini_model = gemini_model
        self.timeout = timeout

        # Availability cache: None = not yet probed
        self._ollama_ok: Optional[bool] = None
        self._gemini_ok: Optional[bool] = None

        # Shared async client (created lazily)
        self._client: Optional[httpx.AsyncClient] = None

    # ── client lifecycle ──────────────────────────────────────────────────

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def close(self) -> None:
        """Shut down the underlying HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    # ── availability probing ──────────────────────────────────────────────

    async def probe_ollama(self) -> bool:
        """Return True if Ollama is reachable and serving the target model."""
        try:
            client = await self._get_client()
            headers = {}
            if self.ollama_api_key:
                headers["Authorization"] = f"Bearer {self.ollama_api_key}"
            resp = await client.get(f"{self.ollama_url}/api/tags", headers=headers)
            if resp.status_code == 200:
                models = resp.json().get("models", [])
                names = [m.get("name", "") for m in models]
                # Ollama returns model names; check if our target is available
                # Model names may include a tag suffix like ":latest"
                available = any(
                    self.ollama_model in name for name in names
                )
                if available:
                    logger.info("Ollama: model '%s' is available.", self.ollama_model)
                    self._ollama_ok = True
                    return True
                # Model not found but server is up — still usable (Ollama will pull)
                logger.info(
                    "Ollama: server up but model '%s' not in local list; "
                    "Ollama may auto-pull on first request.",
                    self.ollama_model,
                )
                self._ollama_ok = True
                return True
        except Exception as exc:
            logger.debug("Ollama probe failed: %s", exc)
        self._ollama_ok = False
        return False

    async def probe_gemini(self) -> bool:
        """Return True if a Gemini API key is configured."""
        ok = bool(self.gemini_api_key)
        self._gemini_ok = ok
        if ok:
            logger.info("Gemini API key configured; Gemini backend available.")
        else:
            logger.debug("No GEMINI_API_KEY set; Gemini backend unavailable.")
        return ok

    async def ensure_available(self) -> Optional[str]:
        """Probe backends and return the name of the first available one."""
        if self._ollama_ok is None:
            await self.probe_ollama()
        if self._ollama_ok:
            return "ollama"

        if self._gemini_ok is None:
            await self.probe_gemini()
        if self._gemini_ok:
            return "gemini"

        return None

    # ── generation ────────────────────────────────────────────────────────

    async def generate_statement(
        self,
        agent_id: str,
        personality: Dict[str, float],
        mood: str,
        memory_context: Dict[str, Any],
        mode: str = "collaborate",
        topic: Optional[str] = None,
        previous_statement: Optional[str] = None,
    ) -> Optional[str]:
        """Generate a character statement via the first available LLM.

        Returns the generated text, or ``None`` if no LLM backend is
        reachable (caller should fall back to templates).
        """
        prompt = _build_prompt(
            agent_id=agent_id,
            personality=personality,
            mood=mood,
            memory_context=memory_context,
            mode=mode,
            topic=topic,
            previous_statement=previous_statement,
        )

        # ── try Ollama ────────────────────────────────────────────────────
        if self._ollama_ok is not False:
            result = await self._try_ollama(prompt)
            if result is not None:
                self._ollama_ok = True
                return result
            # Only mark as unavailable on connection errors, not generation errors
            # (generation errors might be transient)

        # ── try Gemini ────────────────────────────────────────────────────
        if self._gemini_ok is not False:
            if not self.gemini_api_key:
                # Probe to confirm
                if self._gemini_ok is None:
                    await self.probe_gemini()
            if self._gemini_ok:
                result = await self._try_gemini(prompt)
                if result is not None:
                    return result

        return None

    # ── Ollama backend ────────────────────────────────────────────────────

    async def _try_ollama(self, prompt: str) -> Optional[str]:
        """Send a generate request to Ollama.  Returns text or None."""
        try:
            client = await self._get_client()
            payload = {
                "model": self.ollama_model,
                "messages": [
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "stream": False,
                "options": {
                    "temperature": 0.85,
                    "num_predict": 150,  # keep responses short
                },
            }
            resp = await client.post(
                f"{self.ollama_url}/api/chat",
                json=payload,
                headers={"Authorization": f"Bearer {self.ollama_api_key}"} if self.ollama_api_key else {},
                timeout=self.timeout,
            )
            if resp.status_code == 200:
                data = resp.json()
                text = data.get("message", {}).get("content", "").strip()
                if text:
                    logger.debug("Ollama generated: %s", text[:80])
                    return _clean_statement(text)
                return None
            else:
                logger.warning("Ollama returned status %d", resp.status_code)
                return None
        except httpx.ConnectError:
            logger.debug("Ollama connection refused.")
            self._ollama_ok = False
            return None
        except Exception as exc:
            logger.warning("Ollama request failed: %s", exc)
            return None

    # ── Gemini backend ────────────────────────────────────────────────────

    async def _try_gemini(self, prompt: str) -> Optional[str]:
        """Send a generate request to the Gemini REST API.  Returns text or None."""
        if not self.gemini_api_key:
            return None
        try:
            client = await self._get_client()
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{self.gemini_model}:generateContent"
                f"?key={self.gemini_api_key}"
            )
            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": _SYSTEM_PROMPT + "\n\n" + prompt}
                        ]
                    }
                ],
                "generationConfig": {
                    "temperature": 0.85,
                    "maxOutputTokens": 150,
                },
            }
            resp = await client.post(url, json=payload, timeout=self.timeout)
            if resp.status_code == 200:
                data = resp.json()
                candidates = data.get("candidates", [])
                if candidates:
                    text_parts = (
                        candidates[0]
                        .get("content", {})
                        .get("parts", [])
                    )
                    if text_parts:
                        text = text_parts[0].get("text", "").strip()
                        if text:
                            logger.debug("Gemini generated: %s", text[:80])
                            return _clean_statement(text)
                return None
            else:
                logger.warning("Gemini returned status %d", resp.status_code)
                return None
        except Exception as exc:
            logger.warning("Gemini request failed: %s", exc)
            return None


# ── text cleaning ─────────────────────────────────────────────────────────

def _clean_statement(text: str) -> str:
    """Strip common LLM artefacts (quotes, markdown, role-play markers)."""
    # Remove wrapping quotes
    if len(text) >= 2 and text[0] in ('"', "'") and text[-1] == text[0]:
        text = text[1:-1].strip()
    # Remove leading agent-name prefixes like "Alpha:" or "[alpha]:"
    for prefix_delim in (":", "]"):
        idx = text.find(prefix_delim)
        if 0 < idx < 30:
            candidate = text[idx + 1 :].strip()
            if candidate:
                text = candidate
                break
    # Remove markdown bold/italic
    text = text.replace("**", "").replace("*", "")
    # Collapse whitespace
    text = " ".join(text.split())
    return text


# ── singleton helper ──────────────────────────────────────────────────────

_global_reasoner: Optional[LLMReasoner] = None


def get_reasoner() -> LLMReasoner:
    """Return a module-level singleton ``LLMReasoner``."""
    global _global_reasoner
    if _global_reasoner is None:
        _global_reasoner = LLMReasoner()
    return _global_reasoner
