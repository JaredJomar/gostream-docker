"""Minimal Prowlarr client shim used by the sync scripts.

The repository documents a Prowlarr adapter, but the generated module is not
present in this checkout. This shim keeps the sync scripts runnable and lets
existing Torrentio fallback logic handle requests when Prowlarr is unavailable.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


class ProwlarrClient:
    def __init__(self) -> None:
        self.enabled = False

    def fetch_torrents(
        self,
        imdb_id: str,
        content_type: str,
        title: str = "",
    ) -> List[Dict[str, Any]]:
        return []
