param(
    [string]$ProjectRoot = "I:\yt-dlp",
    [string]$EnvScriptsDir = "C:\Users\84027\.conda\envs\yt-dlp\Scripts",
    [string]$YtDlpStandaloneUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$toolsDir = Join-Path $ProjectRoot "tools"
$releaseDir = Join-Path $ProjectRoot "release"
$shareRoot = Join-Path $releaseDir "share"
$shareZip = Join-Path $releaseDir "YT-DLP-Studio-share.zip"

$requiredFiles = @(
    "ffmpeg.exe",
    "ffprobe.exe"
)

New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

foreach ($fileName in $requiredFiles) {
    $sourcePath = Join-Path $EnvScriptsDir $fileName
    if (-not (Test-Path $sourcePath)) {
        throw "Required tool not found: $sourcePath"
    }

    Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $toolsDir $fileName) -Force
}

$ytDlpDestination = Join-Path $toolsDir "yt-dlp.exe"
Write-Host "Downloading standalone yt-dlp.exe from official release..."
Invoke-WebRequest -Uri $YtDlpStandaloneUrl -OutFile $ytDlpDestination

Push-Location $ProjectRoot
try {
    npm run build | Out-Host
    npx electron-builder --dir | Out-Host
}
finally {
    Pop-Location
}

$unpackedDir = Join-Path $releaseDir "win-unpacked"
if (-not (Test-Path $unpackedDir)) {
    throw "Portable app folder not found: $unpackedDir"
}

if (Test-Path $shareRoot) {
    Remove-Item -LiteralPath $shareRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $shareRoot | Out-Null
Copy-Item -LiteralPath $unpackedDir -Destination (Join-Path $shareRoot "YT-DLP Studio") -Recurse -Force

$portableAppDir = Join-Path $shareRoot "YT-DLP Studio"
$userDataCandidates = @(
    (Join-Path $portableAppDir "user-data"),
    (Join-Path $portableAppDir "User Data"),
    (Join-Path $portableAppDir "cookies")
)

foreach ($candidate in $userDataCandidates) {
    if (Test-Path $candidate) {
        Remove-Item -LiteralPath $candidate -Recurse -Force
    }
}

if (Test-Path $shareZip) {
    Remove-Item -LiteralPath $shareZip -Force
}

Compress-Archive -Path (Join-Path $shareRoot "YT-DLP Studio") -DestinationPath $shareZip -Force

Write-Host ""
Write-Host "Shareable package is ready:"
Write-Host $shareZip
