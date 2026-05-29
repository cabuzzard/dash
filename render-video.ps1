# render-video.ps1
# Usage: .\render-video.ps1 -PostId "abc123" -Slug "my-post-title" -Token "session-token"
# Script text is read from C:\Users\18318\Videos\src\script.txt (pre-written by the modal command)
param(
    [string]$PostId,
    [string]$Slug,
    [string]$Token
)

$RemotionDir  = "C:\Users\18318\Videos"
$VideosDir    = "C:\Users\18318\dash\videos"
$OutFile      = "$VideosDir\$Slug.mp4"
$WorkerUrl    = "https://jolly-darkness-5dcc.trailnotes2026.workers.dev"

New-Item -ItemType Directory -Force $VideosDir | Out-Null

Write-Host "Generating audio..."
Set-Location $RemotionDir
node scripts/generate-audio.js
if ($LASTEXITCODE -ne 0) { Write-Host "Audio generation failed"; exit 1 }

Write-Host "Rendering video..."
npx remotion render VoiceoverVideo $OutFile --scale=0.667
if ($LASTEXITCODE -ne 0) { Write-Host "Render failed"; exit 1 }

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
