#!/usr/bin/env python3
"""Read-only validator for Yelim product publication plans."""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any


def folded(value: Any) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    return "".join(char for char in text if unicodedata.category(char) != "Mn").lower()


def compact(value: Any) -> str:
    return re.sub(r"\s+", " ", folded(value)).strip()


def source_names(product: dict[str, Any]) -> list[str]:
    explicit = product.get("requiredStudioSources")
    if isinstance(explicit, list) and explicit:
        return [str(item) for item in explicit if str(item).strip()]
    options = product.get("options") or []
    names = [str(option.get("source")) for option in options if isinstance(option, dict) and option.get("source")]
    if names:
        return list(dict.fromkeys(names))
    source = product.get("source") or product.get("file")
    return [str(source)] if source else []


def option_price(option: dict[str, Any]) -> int | None:
    raw = option.get("prix", option.get("price"))
    if isinstance(raw, bool):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def contains_term(value: Any, terms: list[str]) -> str | None:
    haystack = compact(value)
    for term in terms:
        needle = compact(term)
        if needle and needle in haystack:
            return term
    return None


def validate_product(
    product: dict[str, Any],
    index: int,
    source_dir: Path | None,
    vendor_terms: list[str],
) -> tuple[list[str], list[str]]:
    label = product.get("nom") or product.get("name") or f"product[{index}]"
    prefix = f"{label}: "
    errors: list[str] = []
    warnings: list[str] = []
    publishable = product.get("publishable", True) is not False

    for field in ("nom", "nomCollection"):
        if not str(product.get(field) or "").strip():
            errors.append(prefix + f"missing {field}")

    sources = source_names(product)
    if not sources:
        errors.append(prefix + "missing source/requiredStudioSources")
    if source_dir:
        for source in sources:
            candidate = Path(source)
            if not candidate.is_absolute():
                candidate = source_dir / source
            if not candidate.exists():
                errors.append(prefix + f"source file not found: {candidate}")

    options = product.get("options")
    if not isinstance(options, list) or not options:
        errors.append(prefix + "options must be a non-empty list")
        prices: list[int] = []
    else:
        prices = []
        labels: set[str] = set()
        for option_index, option in enumerate(options):
            if not isinstance(option, dict):
                errors.append(prefix + f"option[{option_index}] must be an object")
                continue
            option_label = str(option.get("label") or option.get("valeur") or "").strip()
            if not option_label:
                errors.append(prefix + f"option[{option_index}] missing label/valeur")
            normalized_label = compact(option_label)
            if normalized_label in labels:
                errors.append(prefix + f"duplicate option label: {option_label}")
            labels.add(normalized_label)
            price = option_price(option)
            if price is None or price <= 0:
                errors.append(prefix + f"option[{option_index}] has invalid price")
            else:
                prices.append(price)

    if prices and product.get("prix") is not None:
        try:
            root_price = int(product["prix"])
        except (TypeError, ValueError):
            errors.append(prefix + "prix must be an integer")
        else:
            if root_price != min(prices):
                errors.append(prefix + f"prix {root_price} must equal lowest option price {min(prices)}")

    if prices and len(prices) > 1 and not str(product.get("variantDimension") or product.get("expectedVariantName") or "").strip():
        errors.append(prefix + "multiple options require variantDimension/expectedVariantName")

    if publishable and not product.get("variantAssessment"):
        warnings.append(prefix + "variantAssessment not recorded; re-check the original image before publication")

    for field in ("stock", "quantiteLimite", "quantiteLimiteExpedition"):
        if product.get(field) is None:
            continue
        try:
            if int(product[field]) <= 0:
                errors.append(prefix + f"{field} must be positive")
        except (TypeError, ValueError):
            errors.append(prefix + f"{field} must be an integer")

    for field in ("prixLivraison", "prixExpedition", "fraisTransportPourLivrerALaGare"):
        if product.get(field) is None:
            if publishable:
                errors.append(prefix + f"missing required transport field: {field}")
            continue
        try:
            if int(product[field]) < 0:
                errors.append(prefix + f"{field} cannot be negative")
        except (TypeError, ValueError):
            errors.append(prefix + f"{field} must be an integer")

    station_fee = product.get("fraisTransportPourLivrerALaGare")
    if publishable and station_fee is not None:
        try:
            station_is_free = int(station_fee) == 0
        except (TypeError, ValueError):
            station_is_free = False
        if station_is_free and product.get("freeStationTransportExplicit") is not True:
            errors.append(prefix + "station transport cannot be 0 unless freeStationTransportExplicit=true")

    public_fields = {
        "desc": product.get("desc", ""),
        "specification": product.get("specification", ""),
        "hashtags": " ".join(str(value) for value in product.get("hashtags", []) or []),
        "keywords": " ".join(str(value) for value in product.get("keywords", []) or []),
    }
    for field, value in public_fields.items():
        term = contains_term(value, vendor_terms)
        if term:
            errors.append(prefix + f"public field {field} contains vendor/supplier term: {term}")

    hashtags = {compact(value) for value in product.get("hashtags", []) or [] if str(value).strip()}
    required_taxonomy = [product.get("nomCollection"), *(product.get("taxonomyAncestors") or [])]
    missing_taxonomy = [
        str(value)
        for value in required_taxonomy
        if str(value or "").strip() and compact(value) not in hashtags
    ]
    if missing_taxonomy:
        errors.append(prefix + "hashtags missing taxonomy chain: " + ", ".join(missing_taxonomy))

    characteristics = product.get("sourceCharacteristics", product.get("features", [])) or []
    if not isinstance(characteristics, list) or not characteristics:
        warnings.append(prefix + "no sourceCharacteristics/features recorded")
    else:
        for characteristic in characteristics:
            normalized = compact(characteristic)
            if normalized.startswith("prix") or " fcfa" in normalized:
                errors.append(prefix + f"price leaked into product characteristic: {characteristic}")

    if product.get("publishable") is False:
        reason = str(product.get("uncertainty") or "").strip()
        if not reason:
            errors.append(prefix + "publishable=false requires uncertainty/reason")
        else:
            warnings.append(prefix + f"blocked from publication: {reason}")

    if product.get("publishable", True) and product.get("studioReady") is False:
        warnings.append(prefix + "publishable but studio image is not ready")

    return errors, warnings


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan", type=Path)
    parser.add_argument("--source-dir", type=Path)
    parser.add_argument("--vendor-term", action="append", default=[])
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        payload = json.loads(args.plan.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(json.dumps({"ok": False, "errors": [str(error)]}, ensure_ascii=False, indent=2))
        return 2

    products = payload.get("products") if isinstance(payload, dict) else None
    if not isinstance(products, list):
        print(json.dumps({"ok": False, "errors": ["plan must contain a products list"]}, ensure_ascii=False, indent=2))
        return 2

    errors: list[str] = []
    warnings: list[str] = []
    seen_names: dict[str, int] = {}
    seen_sources: dict[str, int] = {}
    for index, product in enumerate(products):
        if not isinstance(product, dict):
            errors.append(f"product[{index}] must be an object")
            continue
        product_errors, product_warnings = validate_product(product, index, args.source_dir, args.vendor_term)
        errors.extend(product_errors)
        warnings.extend(product_warnings)

        name_key = compact(product.get("nom"))
        if name_key:
            if name_key in seen_names:
                errors.append(f"duplicate product name at indexes {seen_names[name_key]} and {index}: {product.get('nom')}")
            seen_names[name_key] = index
        for source in source_names(product):
            source_key = Path(source).name.casefold()
            if source_key in seen_sources and seen_sources[source_key] != index:
                errors.append(f"source {source_key} is assigned to products {seen_sources[source_key]} and {index}")
            seen_sources[source_key] = index

    result = {
        "ok": not errors,
        "products": len(products),
        "publishable": sum(1 for product in products if isinstance(product, dict) and product.get("publishable", True)),
        "blocked": sum(1 for product in products if isinstance(product, dict) and product.get("publishable") is False),
        "errors": errors,
        "warnings": warnings,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
