#!/usr/bin/env python3
"""Append or replace one SPS report month in the bundled production history."""

import argparse
import base64
import gzip
import hashlib
import json
from pathlib import Path

import openpyxl

from import_data import month_from_filename, process_file


ROOT = Path(__file__).resolve().parent.parent
HISTORY_DIR = ROOT / "data" / "history"
MANIFEST_PATH = HISTORY_DIR / "manifest.json"
PART_PREFIX = "history-9m.part-"
PART_SIZE = 9_500


def read_encoded_history() -> tuple[str, list[Path]]:
    parts = sorted(HISTORY_DIR.glob(f"{PART_PREFIX}*"))
    if not parts:
        raise RuntimeError("Bundled history parts were not found")
    return "".join(part.read_text(encoding="utf-8") for part in parts).strip(), parts


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("xlsx", type=Path)
    args = parser.parse_args()

    source = args.xlsx.resolve()
    month = month_from_filename(source.name)
    if not month:
        raise RuntimeError("The source filename must contain a YYYY-MM month")

    encoded, old_parts = read_encoded_history()
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    actual_checksum = hashlib.sha256(encoded.encode()).hexdigest()
    expected_checksum = manifest.get("encoded_sha256")
    if expected_checksum and actual_checksum != expected_checksum:
        raise RuntimeError("Bundled history checksum does not match manifest")

    history = json.loads(gzip.decompress(base64.b64decode(encoded)).decode("utf-8"))
    workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)
    reports = process_file(workbook["Business Report"], month, history["members"])
    if not reports:
        raise RuntimeError(f"No member rows found in {source.name}")

    member_ids = [report["member_id"] for report in reports]
    if len(member_ids) != len(set(member_ids)):
        raise RuntimeError(f"Duplicate member ids found in {source.name}")

    fields = history["fields"]
    history["reports"][month] = [[report.get(field) for field in fields] for report in reports]
    history["months"] = sorted(set([*history["months"], month]))

    raw = json.dumps(history, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    updated_encoded = base64.b64encode(gzip.compress(raw, mtime=0)).decode("ascii")
    chunks = [updated_encoded[i:i + PART_SIZE] for i in range(0, len(updated_encoded), PART_SIZE)]
    for index, chunk in enumerate(chunks):
        (HISTORY_DIR / f"{PART_PREFIX}{index:02d}").write_text(chunk, encoding="utf-8")
    for stale_part in old_parts[len(chunks):]:
        stale_part.write_text("", encoding="utf-8")

    report_rows = {item: len(history["reports"][item]) for item in history["months"]}
    source_checksum = hashlib.sha256(source.read_bytes()).hexdigest()
    imports = manifest.get("imports", {})
    imports[month] = {
        "filename": source.name,
        "sha256": source_checksum,
        "rows": len(reports),
    }
    manifest.update({
        "version": 2,
        "period": {
            "start": history["months"][0],
            "end": history["months"][-1],
            "months": len(history["months"]),
        },
        "unique_members": len(history["members"]),
        "report_rows": report_rows,
        "parts": len(chunks),
        "encoded_sha256": hashlib.sha256(updated_encoded.encode()).hexdigest(),
        "imports": imports,
        "notes": [
            "The SPS export labels are reversed: column K contains Sponsor and column L contains Upline.",
            "The application reads this bundled data immediately after deployment.",
        ],
    })
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    members_path = ROOT / "data" / "members.json"
    members_path.write_text(json.dumps(history["members"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    months_path = ROOT / "data" / "months.json"
    legacy_months = json.loads(months_path.read_text(encoding="utf-8")) if months_path.exists() else []
    all_months = sorted(set([*legacy_months, *history["months"]]))
    months_path.write_text(json.dumps(all_months, ensure_ascii=False) + "\n", encoding="utf-8")

    print(json.dumps({
        "month": month,
        "rows": len(reports),
        "unique_members": len(history["members"]),
        "months": len(history["months"]),
        "parts": len(chunks),
        "encoded_sha256": manifest["encoded_sha256"],
        "source_sha256": source_checksum,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
