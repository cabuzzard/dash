# render-video.ps1
# Usage: .\render-video.ps1 -PostId "abc123" -Slug "my-post-title" -Token "session-token"
param(
    [string]$PostId,
    [string]$Slug,
    [string]$Token,
    [string]$VoiceId         = "pNInz6obpgDQGcFmaJgB",
    [string]$CaptionStyle    = "",
    [string]$BackgroundImage = ""
)

$RemotionDir = "C:\Users\18318\Videos"
$VideosDir   = "C:\Users\18318\dash\videos"
$OutFile     = "$VideosDir\$Slug.mp4"
$WorkerUrl   = "https://jolly-darkness-5dcc.trailnotes2026.workers.dev"
$NoBom       = New-Object System.Text.UTF8Encoding($false)

New-Item -ItemType Directory -Force $VideosDir | Out-Null

# -- Fetch saved settings from Notion --
Write-Host "Fetching post settings from Notion..."
try {
    $notionBody = ConvertTo-Json @{ action = 'getSmPost'; id = $PostId; token = $Token } -Depth 3
    $post = Invoke-RestMethod -Uri $WorkerUrl -Method POST `
        -Body $notionBody -ContentType 'application/json' -UseBasicParsing
    if ($post.voiceId)         { $VoiceId        = $post.voiceId;         Write-Host "  Voice:      $VoiceId" }
    if ($post.captionStyle)    { $CaptionStyle   = $post.captionStyle;    Write-Host "  Style:      $CaptionStyle" }
    if ($post.backgroundImage) { $BackgroundImage = $post.backgroundImage; Write-Host "  Background: $BackgroundImage" }
    $vsPath = "C:\Users\18318\Videos\src\voice-settings.json"
    if ($post.voiceSettings) {
        [System.IO.File]::WriteAllText($vsPath, $post.voiceSettings, $NoBom)
        Write-Host "  Voice settings: written (no BOM)"
    } elseif (Test-Path $vsPath) {
        Remove-Item $vsPath -Force
        Write-Host "  Voice settings: cleared"
    }
    if (-not $post.voiceId -and -not $post.captionStyle -and -not $post.backgroundImage -and -not $post.voiceSettings) {
        Write-Host "  No saved settings -- using param defaults"
    }
} catch {
    Write-Host "  Could not reach Notion -- using param defaults ($_)"
}

# -- Caption style -> props file (avoids Windows quote-stripping on --props) --
if ($CaptionStyle -and $CaptionStyle.TrimStart().StartsWith("{")) {
    $StyleProps = $CaptionStyle
    Write-Host "Using custom caption spec from Notion"
} else {
    $StyleProps = '{"highlightColor":"#FFD700","fontSize":68,"captionBottom":180,"windowSize":4}'
    if ($CaptionStyle) { Write-Host "Unknown caption style: $CaptionStyle -- using default" }
}
$PropsFile = "C:\Users\18318\Videos\src\render-props.json"
[System.IO.File]::WriteAllText($PropsFile, $StyleProps, $NoBom)

# -- Background image --
if ($BackgroundImage -and (Test-Path $BackgroundImage)) {
    Write-Host "Copying background image from $BackgroundImage..."
    Copy-Item $BackgroundImage "$RemotionDir\public\background.jpg" -Force
} elseif ($BackgroundImage) {
    Write-Host "Warning: $BackgroundImage not found -- using existing background.jpg"
}

# -- Audio --
Write-Host "Generating audio (voice: $VoiceId)..."
$env:ELEVENLABS_VOICE_ID = $VoiceId
Set-Location $RemotionDir
node scripts/generate-audio.js
if ($LASTEXITCODE -ne 0) { Write-Host "Audio generation failed"; exit 1 }

# -- Video --
Write-Host "Rendering video..."
npx --yes remotion render VoiceoverVideo $OutFile --scale=0.667 --concurrency=1 --props=$PropsFile
if ($LASTEXITCODE -ne 0) { Write-Host "Render failed"; exit 1 }

# -- Notion update --
Write-Host "Updating Notion..."
$LocalPath = $OutFile.Replace("\", "/")
$body = "{`"action`":`"updateSmPostVideoPath`",`"id`":`"$PostId`",`"localPath`":`"$LocalPath`",`"token`":`"$Token`"}"
try {
    Invoke-WebRequest -Uri $WorkerUrl -Method POST -Body $body -ContentType "application/json" -UseBasicParsing | Out-Null
    Write-Host "Notion updated."
} catch {
    Write-Host "Notion update failed (video still saved locally): $_"
}

Write-Host ""
Write-Host "Done! Video saved to:"
Write-Host $OutFile

