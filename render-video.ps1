# render-video.ps1
# Usage: .\render-video.ps1 -PostId "abc123" -Slug "my-post-title" -Token "session-token"
#                           -VoiceId "pNInz6obpgDQGcFmaJgB" -CaptionStyle "Standard"
# Script text is written to C:\Users\18318\Videos\src\script.txt before calling this script.
param(
    [string]$PostId,
    [string]$Slug,
    [string]$Token,
    [string]$VoiceId      = "pNInz6obpgDQGcFmaJgB",
    [string]$CaptionStyle = "Standard"
)

$RemotionDir = "C:\Users\18318\Videos"
$VideosDir   = "C:\Users\18318\dash\videos"
$OutFile     = "$VideosDir\$Slug.mp4"
$WorkerUrl   = "https://jolly-darkness-5dcc.trailnotes2026.workers.dev"

New-Item -ItemType Directory -Force $VideosDir | Out-Null

# ── Caption style → Remotion input props ─────────────────────────────────────
$StyleProps = switch ($CaptionStyle) {
    "Karaoke"   { '{"highlightColor":"#FFD700","fontSize":88,"captionBottom":140,"windowSize":1}' }
    "Cinematic" { '{"highlightColor":"#FFFFFF","fontSize":58,"captionBottom":220,"windowSize":6}' }
    "Energy"    { '{"highlightColor":"#FF4500","fontSize":76,"captionBottom":160,"windowSize":3}' }
    default     { '{"highlightColor":"#FFD700","fontSize":68,"captionBottom":180,"windowSize":4}' }
}

# ── Audio ─────────────────────────────────────────────────────────────────────
Write-Host "Generating audio (voice: $VoiceId)..."
$env:ELEVENLABS_VOICE_ID = $VoiceId
Set-Location $RemotionDir
node scripts/generate-audio.js
if ($LASTEXITCODE -ne 0) { Write-Host "Audio generation failed"; exit 1 }

# ── Video ─────────────────────────────────────────────────────────────────────
Write-Host "Rendering video (style: $CaptionStyle)..."
npx remotion render VoiceoverVideo $OutFile --scale=0.667 --props=$StyleProps
if ($LASTEXITCODE -ne 0) { Write-Host "Render failed"; exit 1 }

# ── Notion update ─────────────────────────────────────────────────────────────
Write-Host "Updating Notion..."
$LocalPath = $OutFile.Replace("\", "/")
$body = "{`"action`":`"updateSmPostVideoPath`",`"id`":`"$PostId`",`"localPath`":`"$LocalPath`",`"token`":`"$Token`"}"
try {
    Invoke-WebRequest -Uri $WorkerUrl -Method POST -Body $body -ContentType "application/json" | Out-Null
    Write-Host "Notion updated."
} catch {
    Write-Host "Notion update failed (video still saved locally): $_"
}

Write-Host ""
Write-Host "Done! Video saved to:"
Write-Host $OutFile
