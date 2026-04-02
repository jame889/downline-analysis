#!/usr/bin/env python3
"""
Import SPS business report Excel files → JSON data files for Next.js app.

Output layout:
  data/
    members.json          { "900057": { id, name, join_date, ... }, ... }
    months.json           ["2025-08", "2025-09", ...]
    reports/
      2025-08.json        [ { member_id, month, level, ... }, ... ]
      2025-09.json
      ...

Usage:
    python3 scripts/import_data.py [--dir path/to/xlsx]
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

# ── Config ────────────────────────────────────────────────────────────────────

DEFAULT_XLSX_DIR = Path(
    "/Users/zenitha/.gemini/antigravity/scratch/downline-analyzer/backfill_downloads"
)
DATA_DIR = Path(__file__).parent.parent / "data"

# ── Helpers ───────────────────────────────────────────────────────────────────

def parse_member_cell(cell):
    """'900057\n(อัจฉรา ศรีตะเถระ)' → ('900057', 'อัจฉรา ศรีตะเถระ')"""
    if not cell:
        return "", ""
    cell = str(cell).strip()
    parts = cell.split("\n", 1)
    member_id = parts[0].strip()
    name = parts[1].strip().strip("()") if len(parts) > 1 else ""
    return member_id, name


def parse_id_from_ref(ref):
    """'900008 (Bussara Meejanpetch)' → '900008'"""
    if not ref:
        return None
    m = re.match(r"(\d+)", str(ref).strip())
    return m.group(1) if m else None


def month_from_filename(filename: str) :
    """'business_report_SPS_2025-08.xlsx' → '2025-08'"""
    m = re.search(r"(\d{4}-\d{2})", filename)
    return m.group(1) if m else None


def safe_float(v) -> float:
    try:
        return float(v) if v not in (None, "") else 0.0
    except (ValueError, TypeError):
        return 0.0


def safe_int(v) -> int:
    try:
        return int(v) if v not in (None, "") else 0
    except (ValueError, TypeError):
        return 0

# ── Main ──────────────────────────────────────────────────────────────────────

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

        # Upsert member
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
            # Update name and lv (keep original join_date)
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

    print(f"Found {len(files)} files\n")

    members: dict = {}
    processed_months: list[str] = []

    for f in files:
        month = month_from_filename(f.name)
        if not month:
            print(f"  [SKIP] {f.name}")
            continue
        try:
            wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
            ws = wb["Business Report"]
            reports = process_file(ws, month, members)

            out_path = reports_dir / f"{month}.json"
            out_path.write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8")
            processed_months.append(month)
            print(f"  [OK] {f.name}  →  {month}  ({len(reports)} members)")
        except Exception as e:
            print(f"  [ERR] {f.name}: {e}")
            import traceback; traceback.print_exc()

    # Write members.json
    (DATA_DIR / "members.json").write_text(
        json.dumps(members, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Write months.json
    (DATA_DIR / "months.json").write_text(
        json.dumps(sorted(processed_months), ensure_ascii=False), encoding="utf-8"
    )

    # Write passwords.json — default password = member_id (only for NEW members)
    pw_file = DATA_DIR / "passwords.json"
    existing_passwords: dict = {}
    if pw_file.exists():
        existing_passwords = json.loads(pw_file.read_text(encoding="utf-8"))

    new_passwords = dict(existing_passwords)
    added = 0
    for member_id in members:
        if member_id not in new_passwords:
            new_passwords[member_id] = member_id  # default: password = member_id
            added += 1

    pw_file.write_text(json.dumps(new_passwords, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\nDone!")
    print(f"  {len(members)} unique members")
    print(f"  {len(processed_months)} months: {processed_months[0]} → {processed_months[-1]}")
    print(f"  passwords.json: {added} new entries (default = member_id)")
    print(f"  Data written to: {DATA_DIR}")


if __name__ == "__main__":
    main()
