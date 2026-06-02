$enc = New-Object System.Text.UTF8Encoding($false)
$templatePath = "C:\Users\18318\dash\microsites\microsite-index.html"
$templateRaw = [System.IO.File]::ReadAllText($templatePath, $enc) -replace "`r`n", "`n"

# Extract the new pp() block from template (from "function pinReset" to closing "}" of pp)
$startMarker = "function pinReset(msg, isErr) {"
$endMarker   = "function pd() {"
$tStart = $templateRaw.IndexOf($startMarker)
$tEnd   = $templateRaw.IndexOf($endMarker)
if ($tStart -lt 0 -or $tEnd -lt 0) { Write-Host "ERROR: markers not found in template"; exit 1 }
$newBlock = $templateRaw.Substring($tStart, $tEnd - $tStart).TrimEnd()

# The old block starts with "async function pp(d) {" and ends just before "function pd() {"
$oldMarker = "async function pp(d) {"

$microsites = @(
  "trail-notes","mobility-mentor-services","taoist-wanderings",
  "mobility-mentor-fundraising","main-notion-ai-content-management",
  "human-ai","foreclosure-fraud","estate-divorce-property-resource",
  "analog-vs-digital-mindset"
)

$updated = 0; $skipped = 0
foreach ($m in $microsites) {
  $path = "C:\Users\18318\dash\microsites\$m\index.html"
  if (-not (Test-Path $path)) { Write-Host "MISSING: $m"; $skipped++; continue }
  $raw = [System.IO.File]::ReadAllText($path, $enc) -replace "`r`n", "`n"

  $oStart = $raw.IndexOf($oldMarker)
  if ($oStart -lt 0) {
    # Already patched (has pinReset) or different format
    if ($raw.Contains("function pinReset")) { Write-Host "ALREADY PATCHED: $m" }
    else { Write-Host "SKIP (no match): $m" }
    $skipped++; continue
  }
  $oEnd = $raw.IndexOf($endMarker, $oStart)
  if ($oEnd -lt 0) { Write-Host "SKIP (no end marker): $m"; $skipped++; continue }
  $oldBlock = $raw.Substring($oStart, $oEnd - $oStart).TrimEnd()

  $result = $raw.Substring(0, $oStart) + $newBlock + "`n" + $raw.Substring($oStart + $oldBlock.Length)
  [System.IO.File]::WriteAllText($path, $result, $enc)
  Write-Host "UPDATED: $m"
  $updated++
}
Write-Host "`nDone. Updated: $updated  Skipped: $skipped"
