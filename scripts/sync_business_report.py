#!/usr/bin/env python3
"""Download, validate, and sync the First Thailand SPS Business Report."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import openpyxl
import requests

from import_data import process_file


BASE_URL = "https://www.firstthailand.co.th"
LOGIN_PAGE = f"{BASE_URL}/common/login/index.do"
LOGIN_URL = f"{BASE_URL}/common/login/loginSubmit.json"
REPORT_PAGE = f"{BASE_URL}/myoffice/performance/getDownlineBusinessReport.do"
DOWNLOAD_URL = f"{BASE_URL}/myoffice/performance/downloadReportExcel.do"
ROOT_MEMBER_ID = "900057"


def selected_months(explicit_month: str | None, include_previous: bool) -> list[str]:
    if explicit_month:
        return [explicit_month]
    now = datetime.now(ZoneInfo("Asia/Bangkok"))
    months = [now.strftime("%Y-%m")]
    if include_previous and now.day <= 3:
        months.append((now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m"))
    return months


def login(session: requests.Session, username: str, password: str) -> None:
    response = session.get(LOGIN_PAGE, timeout=30)
    response.raise_for_status()
    response = session.post(
        LOGIN_URL,
        data={"loginid": username, "passWord": password},
        headers={"X-Requested-With": "XMLHttpRequest", "Accept": "application/json"},
        timeout=30,
    )
    response.raise_for_status()
    result = response.json()
    if result.get("result") is not True:
        raise RuntimeError("First Thailand login failed")
    if result.get("password_update_needed") == "Y":
        raise RuntimeError("First Thailand requires a password update")


def download(session: requests.Session, month: str) -> bytes:
    session.get(REPORT_PAGE, timeout=30).raise_for_status()
    response = session.post(
        DOWNLOAD_URL,
        data={
            "s_month": month,
            "s_grade": "",
            "s_lv_type": "",
            "s_findmember": "",
            "search_type": "SPS",
            "fa_month": "",
        },
        timeout=60,
    )
    response.raise_for_status()
    content = response.content
    if len(content) < 10_000 or not content.startswith(b"PK"):
        raise RuntimeError(f"Downloaded content is not a valid XLSX ({len(content)} bytes)")
    return content


def parse_report(content: bytes, month: str) -> tuple[dict, list[dict]]:
    workbook = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    if "Business Report" not in workbook.sheetnames:
        raise RuntimeError("Business Report worksheet is missing")
    worksheet = workbook["Business Report"]
    upline_header = str(worksheet.cell(1, 11).value or "")
    sponsor_header = str(worksheet.cell(1, 12).value or "")
    if "Upline" not in upline_header or "Sponsor" not in sponsor_header:
        raise RuntimeError(
            f"Unexpected relationship columns: K={upline_header!r}, L={sponsor_header!r}"
        )

    members: dict = {}
    reports = process_file(worksheet, month, members)
    ids = [report["member_id"] for report in reports]
    if not 100 <= len(reports) <= 10_000:
        raise RuntimeError(f"Unexpected report row count: {len(reports)}")
    if len(ids) != len(set(ids)):
        raise RuntimeError("Duplicate member ids in Business Report")
    if ROOT_MEMBER_ID not in members:
        raise RuntimeError(f"Root member {ROOT_MEMBER_ID} is missing")

    upline_counts = Counter(member.get("upline_id") for member in members.values() if member.get("upline_id"))
    invalid_uplines = [member_id for member_id, count in upline_counts.items() if count > 2]
    if invalid_uplines:
        raise RuntimeError(f"Invalid binary placement under upline: {', '.join(invalid_uplines[:5])}")

    root_sponsored = sum(1 for member in members.values() if member.get("sponsor_id") == ROOT_MEMBER_ID)
    root_placed = upline_counts.get(ROOT_MEMBER_ID, 0)
    if root_sponsored < 2 or root_placed > 2:
        raise RuntimeError(
            f"Relationship mapping check failed for {ROOT_MEMBER_ID}: "
            f"sponsored={root_sponsored}, placed={root_placed}"
        )
    return members, reports


def sync_report(sync_url: str, secret: str, payload: dict) -> dict:
    response = requests.post(
        sync_url,
        json=payload,
        headers={"Authorization": f"Bearer {secret}"},
        timeout=90,
    )
    if not response.ok:
        raise RuntimeError(f"Production sync failed ({response.status_code}): {response.text[:500]}")
    return response.json()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--month", help="Report month in YYYY-MM format")
    parser.add_argument("--include-previous", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--output-dir", type=Path, default=Path("downloaded_reports"))
    args = parser.parse_args()

    username = os.environ.get("FIRST_THAILAND_USER", "")
    password = os.environ.get("FIRST_THAILAND_PASSWORD", "")
    secret = os.environ.get("BUSINESS_REPORT_SYNC_SECRET", "")
    sync_url = os.environ.get(
        "BUSINESS_REPORT_SYNC_URL",
        "https://downline-analyzer.vercel.app/api/admin/business-report-sync",
    )
    if not username or not password:
        raise RuntimeError("FIRST_THAILAND_USER and FIRST_THAILAND_PASSWORD are required")
    if not args.dry_run and not secret:
        raise RuntimeError("BUSINESS_REPORT_SYNC_SECRET is required")
    if args.month and not __import__("re").fullmatch(r"\d{4}-(0[1-9]|1[0-2])", args.month):
        raise RuntimeError("--month must use YYYY-MM")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    login(session, username, password)

    for month in selected_months(args.month, args.include_previous):
        content = download(session, month)
        checksum = hashlib.sha256(content).hexdigest()
        members, reports = parse_report(content, month)
        output_path = args.output_dir / f"business_report_SPS_{month}.xlsx"
        output_path.write_bytes(content)
        payload = {
            "month": month,
            "checksum": checksum,
            "members": members,
            "reports": reports,
        }
        result = {"month": month, "rows": len(reports), "members": len(members), "checksum": checksum}
        if not args.dry_run:
            result["production"] = sync_report(sync_url, secret, payload)
        print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
