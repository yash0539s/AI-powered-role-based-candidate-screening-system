"""LLM client (Groq via its OpenAI-compatible endpoint).

* All calls request JSON output (`response_format=json_object`) and are parsed
  defensively -- small models occasionally wrap JSON in prose or code fences.
* Free-tier rate limits (429) are handled with exponential backoff that honours
  the `retry-after` header.
"""
import json
import logging
import re
import time
from functools import lru_cache
from typing import Any

from openai import APIConnectionError, APIStatusError, OpenAI, RateLimitError

from ..config import get_settings

log = logging.getLogger(__name__)


class LLMError(RuntimeError):
    """Raised when the LLM provider fails after retries or returns unusable output."""


def _is_reasoning_model(model: str) -> bool:
    return any(k in model for k in ("gpt-oss", "qwen3", "deepseek-r1"))


def _extract_json(text: str) -> Any:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            return json.loads(m.group(0))
        raise


class LLMClient:
    def __init__(self) -> None:
        s = get_settings()
        if not s.groq_api_key:
            raise LLMError("GROQ_API_KEY is not set. Add it to backend/.env (free key: https://console.groq.com/keys).")
        self.settings = s
        self._client = OpenAI(
            api_key=s.groq_api_key, base_url=s.groq_base_url, timeout=s.llm_timeout_s, max_retries=0
        )

    def json_chat(
        self,
        system: str,
        user: str,
        *,
        fast: bool = False,
        temperature: float | None = None,
        max_tokens: int = 1200,
    ) -> dict:
        s = self.settings
        model = s.llm_model_fast if fast else s.llm_model
        temperature = s.llm_temperature if temperature is None else temperature
        last_exc: Exception | None = None

        extra: dict[str, Any] = {}
        if _is_reasoning_model(model):
            # Hidden reasoning tokens count towards max_tokens -> leave headroom so JSON isn't truncated.
            extra["reasoning_effort"] = s.llm_reasoning_effort
            max_tokens += 1500

        for attempt in range(s.llm_max_retries + 1):
            try:
                resp = self._client.chat.completions.create(
                    model=model,
                    messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                    temperature=temperature,
                    max_tokens=max_tokens,
                    response_format={"type": "json_object"},
                    **extra,
                )
                content = resp.choices[0].message.content or ""
                data = _extract_json(content)
                if not isinstance(data, dict):
                    raise ValueError("expected a JSON object")
                usage = getattr(resp, "usage", None)
                if usage:
                    log.info("LLM %s tokens: in=%s out=%s", model, usage.prompt_tokens, usage.completion_tokens)
                return data
            except RateLimitError as exc:
                last_exc = exc
                wait = self._retry_after(exc) or min(2 ** attempt * 2, 30)
                log.warning("Groq rate limit (attempt %d), sleeping %.1fs", attempt + 1, wait)
                time.sleep(wait)
            except (APIConnectionError, json.JSONDecodeError, ValueError) as exc:
                last_exc = exc
                log.warning("LLM call failed (attempt %d): %s", attempt + 1, exc)
                time.sleep(min(2 ** attempt, 8))
            except APIStatusError as exc:
                last_exc = exc
                # JSON-mode validation failures come back as 400 (code json_validate_failed,
                # message "Failed to validate JSON") - the sampled output was malformed; retry those.
                detail = f"{exc} {exc.body}".lower()
                if exc.status_code >= 500 or "json_validate_failed" in detail or "failed to validate json" in detail:
                    log.warning("LLM status %s (attempt %d), retrying", exc.status_code, attempt + 1)
                    time.sleep(min(2 ** attempt, 8))
                    continue
                raise LLMError(f"LLM request rejected ({exc.status_code}): {exc.message}") from exc
        raise LLMError(f"LLM failed after {s.llm_max_retries + 1} attempts: {last_exc}")

    @staticmethod
    def _retry_after(exc: RateLimitError) -> float | None:
        try:
            val = exc.response.headers.get("retry-after")
            return min(float(val), 60.0) if val else None
        except Exception:
            return None


@lru_cache
def get_llm() -> LLMClient:
    return LLMClient()
