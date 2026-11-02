param([int]$Port = 8000)
$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try {
    $bundledPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $bundledPython) {
        $interpreter = $bundledPython
    } elseif (Get-Command py -ErrorAction SilentlyContinue) {
        $interpreter = 'py'
    } elseif ($pythonCommand -and $pythonCommand.Source -notlike '*\WindowsApps\*') {
        $interpreter = $pythonCommand.Source
    } else {
        throw 'Python is unavailable. Install Python 3, then run python -m http.server 8000 from this folder.'
    }
    Write-Host "Preview: http://localhost:$Port (Ctrl+C to stop)"
    & $interpreter -m http.server $Port --bind 127.0.0.1
} finally {
    Pop-Location
}
