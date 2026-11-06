# Application Register UAT scenario browser

A static, accessible scenario browser for the **9 November 2026** UAT. It contains all **101** scenarios from `AppReg-UAT-Business-Allocation (1).xlsx`: Core AppReg (48), Standard Applicants (18), Reporting (18), and Bulk (17).

## Preview

From this repository, run:

```powershell
.\preview.ps1
```

Open [the local browser](http://localhost:8000). The helper finds Codex's bundled Python or an installed interpreter, avoiding the Windows Store Python alias. You can also use `python -m http.server 8000` when Python is on your PATH. If PowerShell blocks the local script, run `powershell -ExecutionPolicy Bypass -File .\preview.ps1`. Serve the files over HTTP; opening `index.html` directly does not support the PDF font request reliably.

No npm installation, build, backend or external CDN is needed. Stop the server with Ctrl+C.

## Record and export results

- Select a scenario, or use search, suite and outcome filters. Previous and Next follow the current filtered list in workbook order.
- Use **Select tester** to view only that person's allocated cases, or **All scenarios** to see everyone. Empty assignments appear as **Unassigned**. Progress and outcome totals cover the chosen tester across all suites, irrespective of search, suite and outcome filters.
- Enter **Person completing the tests** independently of the allocation filter. The name is saved in this browser and recorded when you change a result or comment. Selecting a tester or entering your name alone never changes earlier results. Existing results without a recorded name show **Not recorded**.
- Choose **Pass**, **Fail**, or **Partially Passed** and enter comments. Changes save immediately in this browser. Clear outcome returns the case to Not Started and keeps its comments.
- **Download results PDF** includes completed cases for the selected tester (or everyone with **All scenarios**), across all suites and irrespective of search, suite and outcome filters. It includes each case's assigned tester and recorded completer, the current completing person's name, original scenario content, comments, outcome counts, untested count, source workbook, allocation workbook, session date and export timestamp. Comments alone do not complete a case.
- Historical results are labelled separately and never count as current outcomes.

There is one run per browser profile and workbook version. Results are local to the browser and website origin, not shared between testers, computers, localhost and GitHub Pages. Private browsing, clearing website data or changing workbook versions may make stored results unavailable. Download the PDF before clearing browser data. If storage fails, the page keeps results in memory and displays an alert so you can export them.

## GitHub Pages

1. Commit these files and push them to the GitHub repository.
2. In the repository's **Settings → Pages**, select **Deploy from a branch**, choose the branch containing these files, and select **/(root)**.
3. Save and use the URL GitHub provides when deployment completes.

All application paths are relative, so the site works at either a domain root or a repository subpath. `.nojekyll` allows direct static serving. This project has been prepared locally; it has not been published.

## Files

```text
index.html                       Page structure and accessible controls
preview.ps1                      Local preview using an available Python interpreter
assets/styles.css                Responsive layout based on supplied screenshots
assets/app.js                    Navigation, filtering and browser-local results
assets/scenarios.js              Generated workbook content and source references
assets/allocations.js            Assigned Tester values matched by unique case ID
assets/pdf.js                    Direct PDF generation and pagination
assets/vendor/                   Local PDF libraries, font and licences/notices
scripts/extract_scenarios.py      Repeatable extraction and exact validation
tests/current-browser.cjs        Current workbook browser and PDF checks
.nojekyll                        GitHub Pages static-serving marker
```

## Source integrity and updates

The supplied screenshots show the older 28-case browser and guide the layout only. All scenario text comes from **Test Steps**. Existing numbering, lettered cases, punctuation, paragraph breaks and workbook order are retained, including `BULK IMPORT UAT 18` with no scenario 17. The final Reporting scenario remains at its original workbook position after Bulk.

The extractor uses Python's standard library. It retains all ten source columns and the Test Steps row number. Suite metadata comes from Run Results, joined by the unique case-code prefix (for example `CORE-01C`), because ticket suffixes differ in spacing and dashes between sheets. Original keys are retained. No scenario text is normalised or rewritten. Previous outcomes are not imported into the current run. The workbook itself is unchanged and is not copied into the website.

Regenerate only after an intentional source update:

```powershell
python scripts/extract_scenarios.py "C:\path\to\AppReg-UAT-Business-Allocation (1).xlsx"
```

Verify the checked-in data without changing files:

```powershell
python scripts/extract_scenarios.py "C:\path\to\AppReg-UAT-Business-Allocation (1).xlsx" --check
```

Validation requires exactly 101 unique cases, the expected suite totals, and an exact match of every source field and its order. The existing storage namespace and case IDs are retained so saved results for matching cases remain available. Results for cases no longer in the workbook remain in browser storage but are not shown in the current run.

### Update tester allocations without changing scenarios or results

The current assignments come from `Run Results` → `Assigned Tester` in `AppReg-UAT-Business-Allocation (1).xlsx`. Scenario content comes from the same workbook's Test Steps sheet.

```powershell
python scripts/extract_scenarios.py "C:\path\to\allocation-workbook.xlsx" --assignments-only
python scripts/extract_scenarios.py "C:\path\to\allocation-workbook.xlsx" --assignments-only --check
```

This reads the Assigned Tester header and joins rows by their unique case-code prefix, never by row position or display title. It requires exactly the existing case IDs and rejects duplicate, missing or unexpected IDs. Assignment values are stored separately in `assets/allocations.js`. Blank values are displayed as Unassigned. Allocation-only updates do not reset or migrate any saved outcomes or comments.

Preview allocation changes locally with `.\preview.ps1` before publishing updates.

## Browser checks

With Node.js, Playwright, and an installed Chromium-based browser available:

```powershell
$env:PLAYWRIGHT_MODULE = "C:\path\to\node_modules\playwright"
$env:BROWSER_EXECUTABLE = "C:\Program Files\Google\Chrome\Application\chrome.exe"
node tests/current-browser.cjs
```

The current test starts its own static server and checks every scenario's displayed source fields and assignment, tester filtering and progress, saved results, comments and PDF download. It generates a PDF fixture under ignored `tmp/qa/` and does not change the workbook or shipped scenario data. The older `tests/browser.cjs` and `tests/verify_pdf.py` fixtures target the previous 107-case workbook.

Render the generated PDF with a PDF viewer or Poppler to review its visual layout.

## Third-party assets

PDF generation uses locally bundled **pdf-lib 1.17.1** (MIT), **@pdf-lib/fontkit 1.1.1** (MIT), and **DejaVu Sans** (Bitstream Vera / DejaVu licence). Attribution and licence files are in `assets/vendor/`. The application does not send scenario text, comments or results to any external service.
