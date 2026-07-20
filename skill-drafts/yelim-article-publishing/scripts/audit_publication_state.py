#!/usr/bin/env python3
"""Audit Yelim publication progress without writing Firestore or Storage."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import unicodedata
import urllib.request
from pathlib import Path
from typing import Any


def decode_value(value: dict[str, Any]) -> Any:
    if "nullValue" in value:
        return None
    for key in ("stringValue", "timestampValue", "referenceValue", "bytesValue"):
        if key in value:
            return value[key]
    for key in ("integerValue", "doubleValue"):
        if key in value:
            try:
                return int(value[key])
            except (TypeError, ValueError):
                return value[key]
    if "booleanValue" in value:
        return bool(value["booleanValue"])
    if "arrayValue" in value:
        return [decode_value(item) for item in value["arrayValue"].get("values", [])]
    if "mapValue" in value:
        return {key: decode_value(item) for key, item in value["mapValue"].get("fields", {}).items()}
    return None


def decode_response(response: list[dict[str, Any]]) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    for item in response:
        document = item.get("document")
        if not document:
            continue
        fields = {key: decode_value(value) for key, value in document.get("fields", {}).items()}
        fields["_id"] = document.get("name", "").rsplit("/", 1)[-1]
        fields["_createTime"] = document.get("createTime")
        fields["_updateTime"] = document.get("updateTime")
        documents.append(fields)
    return documents


def fetch_firestore(project: str, limit: int) -> list[dict[str, Any]]:
    token = subprocess.run(
        ["gcloud", "auth", "print-access-token"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    body = {
        "structuredQuery": {
            "from": [{"collectionId": "Articles"}],
            "orderBy": [{"field": {"fieldPath": "date"}, "direction": "DESCENDING"}],
            "limit": limit,
        }
    }
    url = f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents:runQuery"
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def natural_key(name: str) -> list[Any]:
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", name)]


def folded(value: Any) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    return "".join(char for char in text if unicodedata.category(char) != "Mn").lower()


def source_basenames(article: dict[str, Any]) -> set[str]:
    values = article.get("sourceImages") or []
    if isinstance(values, str):
        values = [values]
    return {Path(str(value)).name.casefold() for value in values}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default="school-hub-bdf8f")
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--studio-dir", type=Path)
    parser.add_argument("--plan", type=Path, help="Publication plan used to ignore duplicates and blocked products")
    parser.add_argument("--vendor")
    parser.add_argument("--limit", type=int, default=300)
    parser.add_argument("--response-json", type=Path, help="Use a saved Firestore runQuery response instead of the network")
    return parser.parse_args()


def plan_sources(product: dict[str, Any]) -> list[str]:
    explicit = product.get("requiredStudioSources")
    if isinstance(explicit, list) and explicit:
        return [Path(str(item)).name for item in explicit if str(item).strip()]
    options = product.get("options") or []
    sources = [Path(str(option.get("source"))).name for option in options if isinstance(option, dict) and option.get("source")]
    if sources:
        return list(dict.fromkeys(sources))
    source = product.get("source") or product.get("file")
    return [Path(str(source)).name] if source else []


def planned_progress(
    plan: dict[str, Any],
    articles: list[dict[str, Any]],
    published_sources: set[str],
    studio_dir: Path,
) -> dict[str, Any]:
    duplicate_map = {
        Path(str(source)).name.casefold(): Path(str(canonical)).name
        for source, canonical in (plan.get("duplicateSourcesIgnored") or {}).items()
    }
    article_names = {folded(article.get("nom")) for article in articles if article.get("nom")}
    pending: list[dict[str, Any]] = []
    blocked: list[dict[str, Any]] = []
    ignored_duplicates = [
        {"source": source, "canonical": canonical}
        for source, canonical in (plan.get("duplicateSourcesIgnored") or {}).items()
    ]

    for product in plan.get("products") or []:
        if not isinstance(product, dict):
            continue
        sources = plan_sources(product)
        source_keys = {source.casefold() for source in sources}
        published = bool(source_keys) and source_keys.issubset(published_sources)
        if not published and folded(product.get("nom")) in article_names:
            published = True
        if published:
            continue
        if product.get("publishable") is False:
            blocked.append({
                "nom": product.get("nom"),
                "sources": sources,
                "reason": product.get("uncertainty") or product.get("reason") or "publishable=false",
            })
            continue
        missing_studio = [source for source in sources if not (studio_dir / f"{Path(source).stem}.png").exists()]
        pending.append({
            "nom": product.get("nom"),
            "sources": sources,
            "stage": "studio" if missing_studio else "publication",
            "missingStudioSources": missing_studio,
        })

    planned_source_keys = {
        source.casefold()
        for product in (plan.get("products") or [])
        if isinstance(product, dict)
        for source in plan_sources(product)
    }
    unpublished_sources = sorted(
        [
            source
            for source in planned_source_keys
            if source not in published_sources and source not in duplicate_map
        ],
        key=natural_key,
    )
    return {
        "nextPendingProduct": pending[0] if pending else None,
        "pendingProducts": pending,
        "blockedProducts": blocked,
        "ignoredDuplicates": ignored_duplicates,
        "unpublishedPlannedSources": unpublished_sources,
    }


def main() -> int:
    args = parse_args()
    try:
        raw = json.loads(args.response_json.read_text(encoding="utf-8")) if args.response_json else fetch_firestore(args.project, args.limit)
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False, indent=2))
        return 2

    articles = decode_response(raw)
    if args.vendor:
        vendor_key = folded(args.vendor)
        articles = [article for article in articles if folded(article.get("vendeur")) == vendor_key]

    published_sources: set[str] = set()
    for article in articles:
        published_sources.update(source_basenames(article))

    extensions = {".jpg", ".jpeg", ".png", ".webp", ".heic"}
    source_files = sorted(
        [path for path in args.source_dir.iterdir() if path.is_file() and path.suffix.casefold() in extensions],
        key=lambda path: natural_key(path.name),
    )
    unpublished = [path.name for path in source_files if path.name.casefold() not in published_sources]
    last_articles = [
        {
            "id": article.get("_id"),
            "nom": article.get("nom"),
            "vendeur": article.get("vendeur"),
            "sourceImages": [Path(str(value)).name for value in (article.get("sourceImages") or [])],
            "createTime": article.get("_createTime"),
        }
        for article in articles[:10]
    ]
    result = {
        "ok": True,
        "articlesInspected": len(articles),
        "sourceFiles": len(source_files),
        "publishedSourceFiles": len(published_sources),
        "lastArticles": last_articles,
        "nextUnpublishedSource": unpublished[0] if unpublished else None,
        "unpublishedSources": unpublished,
    }
    if args.plan:
        try:
            plan = json.loads(args.plan.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            print(json.dumps({"ok": False, "error": f"invalid plan: {error}"}, ensure_ascii=False, indent=2))
            return 2
        studio_dir = args.studio_dir or (args.source_dir / "studio_manual")
        result["planProgress"] = planned_progress(plan, articles, published_sources, studio_dir)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
