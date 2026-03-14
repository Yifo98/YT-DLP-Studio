param(
    [string]$InputPath = "I:\yt-dlp\cookies\412c572e-c1ea-40af-a239-a19b4bc332f1.txt",
    [string]$OutputDir = "I:\yt-dlp\cookies\split"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function Write-Utf8NoBomFile {
    param(
        [string]$Path,
        [string[]]$Lines
    )

    [System.IO.File]::WriteAllLines($Path, $Lines, $Utf8NoBom)
}

function Get-NormalizedDomain {
    param([string]$Domain)

    $normalized = $Domain
    if ($normalized.StartsWith("#HttpOnly_")) {
        $normalized = $normalized.Substring(10)
    }
    return $normalized.TrimStart(".").ToLowerInvariant()
}

function Get-DomainGroupKey {
    param([string]$Domain)

    $normalized = Get-NormalizedDomain -Domain $Domain
    $labels = $normalized.Split(".")
    if ($labels.Length -le 2) {
        return $normalized
    }

    $compoundTlds = @(
        "com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn",
        "co.uk", "org.uk", "gov.uk", "ac.uk",
        "com.hk", "com.sg", "com.my", "com.au"
    )

    $lastTwo = "{0}.{1}" -f $labels[$labels.Length - 2], $labels[$labels.Length - 1]
    if ($compoundTlds -contains $lastTwo -and $labels.Length -ge 3) {
        return "{0}.{1}" -f $labels[$labels.Length - 3], $lastTwo
    }

    return $lastTwo
}

if (-not (Test-Path $InputPath)) {
    throw "Input cookies file not found: $InputPath"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$allLines = Get-Content -LiteralPath $InputPath
$headerLines = @()
$cookieLines = @()

foreach ($line in $allLines) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) {
        $headerLines += $line
    }
    else {
        $cookieLines += $line
    }
}

$groups = @{}

foreach ($line in $cookieLines) {
    $parts = $line -split "`t"
    if ($parts.Length -lt 7) {
        continue
    }

    $groupKey = Get-DomainGroupKey -Domain $parts[0]
    if (-not $groups.ContainsKey($groupKey)) {
        $groups[$groupKey] = [System.Collections.Generic.List[string]]::new()
    }
    $groups[$groupKey].Add($line)
}

$indexRows = [System.Collections.Generic.List[object]]::new()

foreach ($groupKey in ($groups.Keys | Sort-Object)) {
    $safeName = ($groupKey -replace '[^a-z0-9\.-]', '_')
    $targetPath = Join-Path $OutputDir "$safeName.txt"

    $content = @()
    $content += "# Netscape HTTP Cookie File"
    $content += "# Split from $([System.IO.Path]::GetFileName($InputPath))"
    $content += "# Group: $groupKey"
    $content += ""
    $content += $groups[$groupKey]

    Write-Utf8NoBomFile -Path $targetPath -Lines $content

    $domains = $groups[$groupKey] | ForEach-Object {
        ($_ -split "`t")[0]
    } | ForEach-Object {
        Get-NormalizedDomain -Domain $_
    } | Sort-Object -Unique

    $indexRows.Add([PSCustomObject]@{
        File = [System.IO.Path]::GetFileName($targetPath)
        Group = $groupKey
        CookieCount = $groups[$groupKey].Count
        Domains = ($domains -join ", ")
    }) | Out-Null
}

$bilibiliPatterns = @(
    "bilibili.com",
    "bilibili.cn",
    "biligame.com",
    "huasheng.cn"
)

$bilibiliLines = $cookieLines | Where-Object {
    $domain = Get-NormalizedDomain -Domain (($_ -split "`t")[0])
    $matched = $false
    foreach ($pattern in $bilibiliPatterns) {
        if ($domain -eq $pattern -or $domain.EndsWith(".$pattern")) {
            $matched = $true
            break
        }
    }
    $matched
}

if ($bilibiliLines.Count -gt 0) {
    $bilibiliPath = Join-Path $OutputDir "bilibili-family.txt"
    $content = @(
        "# Netscape HTTP Cookie File",
        "# Split from $([System.IO.Path]::GetFileName($InputPath))",
        "# Group: bilibili family",
        ""
    ) + $bilibiliLines

    Write-Utf8NoBomFile -Path $bilibiliPath -Lines $content
}

$indexPath = Join-Path $OutputDir "index.csv"
$csvRows = @('File,Group,CookieCount,Domains')
foreach ($row in ($indexRows | Sort-Object CookieCount -Descending)) {
    $csvRows += '"{0}","{1}","{2}","{3}"' -f ($row.File -replace '"', '""'), ($row.Group -replace '"', '""'), $row.CookieCount, ($row.Domains -replace '"', '""')
}
Write-Utf8NoBomFile -Path $indexPath -Lines $csvRows

Write-Host "Split completed."
Write-Host "Output directory: $OutputDir"
Write-Host "Index file: $indexPath"
if (Test-Path (Join-Path $OutputDir "bilibili-family.txt")) {
    Write-Host "Bilibili family file: $(Join-Path $OutputDir "bilibili-family.txt")"
}
