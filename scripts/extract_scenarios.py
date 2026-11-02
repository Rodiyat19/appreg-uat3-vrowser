"""Extract or verify the browser's scenario data. Uses Python's standard library only."""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
FIELDS = ["caseKey", "scope", "scenarioId", "title", "goal", "preconditions", "steps", "expected", "sourceComments", "history"]
PREFIX = "window.UAT_DATA = "


def read_sheets(path):
    with ZipFile(path) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = ["".join(e.itertext()) for e in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("s:si", NS)]
        relationships = {e.attrib["Id"]: e.attrib["Target"] for e in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
        result = {}
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        for sheet in workbook.find("s:sheets", NS):
            rel = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
            target = relationships[rel]
            filename = target.lstrip("/") if target.startswith("/") else "xl/" + target
            rows = {}
            for row in ET.fromstring(archive.read(filename)).findall("s:sheetData/s:row", NS):
                cells = {}
                for cell in row:
                    col = re.match(r"[A-Z]+", cell.attrib["r"])[0]
                    kind = cell.attrib.get("t")
                    v = cell.find("s:v", NS)
                    if kind == "inlineStr":
                        value = "".join(e.text or "" for e in cell.findall("s:is//s:t", NS))
                    elif kind == "s" and v is not None:
                        value = strings[int(v.text)]
                    else:
                        value = v.text if v is not None else None
                    cells[col] = value
                rows[int(row.attrib["r"])] = cells
            result[sheet.attrib["name"]] = rows
        return result


def code(key):
    match = re.match(r"^(CORE|SA|RP|BU)-\d+[A-Z]?", key)
    if not match:
        raise ValueError(f"Unrecognised case key: {key!r}")
    return match[0]


def extract(path):
    sheets = read_sheets(path)
    run = {}
    for row, cells in sheets["Run Results"].items():
        if row < 6 or not cells.get("A"):
            continue
        key = code(cells["A"])
        if key in run:
            raise ValueError(f"Duplicate Run Results code: {key}")
        run[key] = (row, cells)
    scenarios = []
    for row, cells in sheets["Test Steps"].items():
        if row < 6 or not cells.get("A"):
            continue
        scenario = {field: cells.get(chr(65 + i)) for i, field in enumerate(FIELDS)}
        key = code(scenario["caseKey"])
        run_row, metadata = run[key]
        scenario.update(id=key, suite=metadata["B"], sourceRow=row, runResultsRow=run_row,
                        runResultsCaseKey=metadata["A"])
        for field in FIELDS[:8]:
            if not scenario[field]:
                raise ValueError(f"Missing {field} at row {row}")
        scenarios.append(scenario)
    assert len(scenarios) == 107
    assert len({s["id"] for s in scenarios}) == 107
    assert {s["id"] for s in scenarios} == set(run)
    assert collections.Counter(s["suite"] for s in scenarios) == {"Core AppReg": 46, "Standard Applicants": 26, "Reporting": 18, "Bulk": 17}
    bulk_ids = [s["scenarioId"] for s in scenarios if s["suite"] == "Bulk"]
    assert "BULK IMPORT UAT 17" not in bulk_ids and "BULK IMPORT UAT 18" in bulk_ids
    for scenario_id in ["STD APP 12a", "STD APP 12b", "STD APP 17a", "STD APP 17b", "REPORT UAT 3a", "REPORT UAT 3b", "REPORT UAT 4a", "REPORT UAT 4b"]:
        assert scenario_id in [s["scenarioId"] for s in scenarios]
    return {"source": path.name, "version": hashlib.sha256(path.read_bytes()).hexdigest(),
            "sessionDate": "2026-11-09", "sheet": "Test Steps", "scenarios": scenarios}


def extract_allocations(path):
    """Read allocation metadata only; never replace existing scenario wording/version."""
    rows = read_sheets(path)["Run Results"]
    header_row, headers = next((r, c) for r, c in rows.items() if "Assigned Tester" in c.values() and "Case Key" in c.values())
    columns = {label: column for column, label in headers.items()}
    assignments = {}
    for row, cells in rows.items():
        key = cells.get(columns["Case Key"])
        if row <= header_row or not key:
            continue
        case_id = code(key)
        if case_id in assignments:
            raise ValueError(f"Duplicate assignment case ID: {case_id}")
        value = cells.get(columns["Assigned Tester"])
        assignments[case_id] = str(value) if value is not None and str(value).strip() else None
    baseline = json.loads((ROOT / "assets" / "scenarios.js").read_text(encoding="utf-8")[len(PREFIX):].rstrip().removesuffix(";"))
    expected = {s["id"] for s in baseline["scenarios"]}
    if set(assignments) != expected:
        raise ValueError(f"Allocation IDs differ from existing scenarios. Missing: {sorted(expected - set(assignments))}; unexpected: {sorted(set(assignments) - expected)}")
    return {"source": path.name, "version": hashlib.sha256(path.read_bytes()).hexdigest(),
            "sheet": "Run Results", "assignments": assignments}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--check", action="store_true", help="Compare every extracted field without writing files")
    parser.add_argument("--assignments-only", action="store_true", help="Import Assigned Tester by case ID without changing scenarios or saved-result keys")
    args = parser.parse_args()
    data = extract_allocations(args.workbook) if args.assignments_only else extract(args.workbook)
    destination = ROOT / "assets" / ("allocations.js" if args.assignments_only else "scenarios.js")
    prefix = "window.UAT_ALLOCATIONS = " if args.assignments_only else PREFIX
    if args.check:
        existing = json.loads(destination.read_text(encoding="utf-8")[len(prefix):].rstrip().removesuffix(";"))
        assert existing == data, "Scenario data differs from the workbook. Regenerate and review changes."
        print("PASS: all 107 allocation IDs and Assigned Tester values match." if args.assignments_only else "PASS: all 107 scenarios, every source field, order, suite mapping and workbook hash match.")
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(prefix + json.dumps(data, ensure_ascii=True, indent=2) + ";\n", encoding="utf-8")
        print(f"Extracted {len(data.get('assignments', data.get('scenarios', [])))} records to {destination}")


if __name__ == "__main__":
    main()
