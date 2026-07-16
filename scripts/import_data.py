#!/usr/bin/env python3
"""
Import SPS business report Excel files into private runtime JSON files.

Security requirements:
- Point PRIVATE_DATA_DIR outside the repository for production data.
- This importer never creates passwords.
- Provision credentials separately with scripts/migrate_passwords.py or an identity provider.
"""

import json
import os
import re
import sys
import warnings
import argparse
from pathlib import Path

warnings.filterwarnings("ignore")

try:
    import openpyxl
except ImportError:
    print("Installing openpyxl...")
    os.system(f"{sys.executable} -m pip install openpyxl --quiet")
    import openpyxl

DEFAULT_XLSX_DIR = Path(
    "/Users/zenitha/.gemini/antigravity/scratch/downline-analyzer/backfill_downloads"
)
DATA_DIR = Path(os.environ.get("PRIVATE_DATA_DIR", Path(__file__).parent.parent / "data")).resolve()


def parse_member_cell(cell):
    if not cell:
        return "", ""
    cell = str(cell).strip()
    parts = cell.split("\n", 1)
    member_id = parts[0].strip()
    name = parts[1].strip().strip("()") if len(parts) > 1 else ""
    return member_id, name


def parse_id_from_ref(ref):
    if not ref:
        return None
    match = re.match(r"(\d+)", str(ref).strip())
    return match.group(1) if match else None


def month_from_filename(filename: str):
    match = re.search(r"(\d{4}-\d{2})", filename)
    return match.group(1) if match else None


def safe_float(value) -> float:
    try:
        return float(value) if value not in (None, "") else 0.0
    except (ValueError, TypeError):
        return 0.0


def safe_int(value) -> int:
    try:
        return int(value) if value not in (None, "") else 0
    except (ValueError, TypeError):
        return 0


def process_file(ws, month: str, members: dict) -> list[dict]:
    reports = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        padded = (list(row) + [None] * 30)[:25]
        (
            level, member_cell, join_date, highest_pos, income_pos,
            promo_goal, country, lv, free_active_end, monthly_bv,
            sponsor_ref, upline_ref, is_active, is_qualified,
            left_pos, right_pos,
            total_vol_l, total_vol_r,
            prev_vol_l, prev_vol_r,
            curr_vol_l, curr_vol_r,
            ded_vol_l, ded_vol_r,
            *_
        ) = padded

        if not member_cell:
            continue

        member_id, name = parse_member_cell(member_cell)
        if not member_id:
            continue

        upline_id = parse_id_from_ref(upline_ref)
        sponsor_id = parse_id_from_ref(sponsor_ref)

        if member_id not in members:
            members[member_id] = {
                "id": member_id,
                "name": name,
                "join_date": str(join_date) if join_date else None,
                "country": str(country) if country else None,
                "lv": safe_float(lv),
                "upline_id": upline_id,
                "sponsor_id": sponsor_id,
            }
        else:
            members[member_id]["name"] = name
            members[member_id]["lv"] = safe_float(lv)
            if not members[member_id]["upline_id"] and upline_id:
                members[member_id]["upline_id"] = upline_id
            if not members[member_id]["sponsor_id"] and sponsor_id:
                members[member_id]["sponsor_id"] = sponsor_id

        reports.append({
            "member_id": member_id,
            "month": month,
            "level": safe_int(level),
            "highest_position": str(highest_pos) if highest_pos else None,
            "income_position": str(income_pos) if income_pos else None,
            "promotion_goal": str(promo_goal) if promo_goal else None,
            "free_active_end_month": str(free_active_end) if free_active_end else None,
            "monthly_bv": safe_float(monthly_bv),
            "is_active": str(is_active).upper() == "Y",
            "is_qualified": str(is_qualified).upper() == "Y",
            "left_highest_pos": str(left_pos) if left_pos else None,
            "right_highest_pos": str(right_pos) if right_pos else None,
            "total_vol_left": safe_float(total_vol_l),
            "total_vol_right": safe_float(total_vol_r),
            "prev_month_vol_left": safe_float(prev_vol_l),
            "prev_month_vol_right": safe_float(prev_vol_r),
            "current_month_vol_left": safe_float(curr_vol_l),
            "current_month_vol_right": safe_float(curr_vol_r),
            "deducted_vol_left": safe_float(ded_vol_l),
            "deducted_vol_right": safe_float(ded_vol_r),
        })

    return reports


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=str(DEFAULT_XLSX_DIR))
    args = parser.parse_args()

    xlsx_dir = Path(args.dir)
    reports_dir = DATA_DIR / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)

    files = sorted(xlsx_dir.glob("business_report_SPS_*.xlsx"))
    if not files:
        print(f"[ERROR] No Excel files found in: {xlsx_dir}")
        sys.exit(1)

    members: dict = {}
    processed_months: list[str] = []

    for file in files:
        month = month_from_filename(file.name)
        if not month:
            continue
        try:
            workbook = openpyxl.load_workbook(file, read_only=True, data_only=True)
            worksheet = workbook["Business Report"]
            reports = process_file(worksheet, month, members)
            (reports_dir / f"{month}.json").write_text(
                json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            processed_months.append(month)
            print(f"[OK] {file.name} -> {month} ({len(reports)} members)")
        except Exception as error:
            print(f"[ERR] {file.name}: {error}")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "members.json").write_text(
        json.dumps(members, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (DATA_DIR / "months.json").write_text(
        json.dumps(sorted(processed_months), ensure_ascii=False), encoding="utf-8"
    )

    print(f"Data written to private directory: {DATA_DIR}")
    print("No passwords were created. Provision hashed credentials separately.")


if __name__ == "__main__":
    main()
