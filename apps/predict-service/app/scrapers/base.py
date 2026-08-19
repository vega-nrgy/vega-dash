"""Shared HTTP session/retry/rate-limit helpers for all scrapers."""

import time

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)


def new_session() -> requests.Session:
    """A session with automatic retries on transient failures (connection
    errors, 5xx, 429), reused across requests to a given site so TCP/TLS
    setup isn't repeated per station."""
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=1.5,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update({"User-Agent": USER_AGENT})
    return session


class RateLimiter:
    """Enforces a minimum delay between successive requests to a single
    host, so we stay a polite, low-impact client against a live
    government site rather than firing requests back-to-back."""

    def __init__(self, min_interval_s: float):
        self.min_interval_s = min_interval_s
        self._last_request_at: float | None = None

    def wait(self) -> None:
        if self._last_request_at is not None:
            elapsed = time.monotonic() - self._last_request_at
            remaining = self.min_interval_s - elapsed
            if remaining > 0:
                time.sleep(remaining)
        self._last_request_at = time.monotonic()
