param([string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")))

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$effectRoot = Join-Path $ProjectRoot "assets\icons\effects"
$moveData = Get-Content -Raw -Encoding UTF8 (Join-Path $ProjectRoot "data\moves.json") | ConvertFrom-Json
$moveTypes = @{}
foreach ($move in $moveData.moves) { $moveTypes[[string]$move.id] = [string]$move.type }

$typeColors = @{
  normal="#a8a77a"; fighting="#c22e28"; flying="#a98ff3"; poison="#a33ea1";
  ground="#e2bf65"; rock="#b6a136"; bug="#a6b91a"; ghost="#735797";
  steel="#b7b7ce"; fire="#ee8130"; water="#6390f0"; grass="#7ac74c";
  electric="#f7d02c"; psychic="#f95587"; ice="#96d9d6"; dragon="#6f35fc";
  dark="#705746"; fairy="#d685ad"
}

function Color([string]$hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }
function Lighten([System.Drawing.Color]$color, [int]$amount) {
  [System.Drawing.Color]::FromArgb(255, [Math]::Min(255,$color.R+$amount), [Math]::Min(255,$color.G+$amount), [Math]::Min(255,$color.B+$amount))
}
function Darken([System.Drawing.Color]$color, [int]$amount) {
  [System.Drawing.Color]::FromArgb(255, [Math]::Max(0,$color.R-$amount), [Math]::Max(0,$color.G-$amount), [Math]::Max(0,$color.B-$amount))
}
function Seed([string]$text) {
  $value = 2166136261L
  foreach ($char in $text.ToCharArray()) { $value = (($value -bxor [int]$char) * 16777619L) % 2147483647L }
  [Math]::Abs([int]$value)
}
function Points([int[][]]$pairs) {
  [System.Drawing.Point[]]@($pairs | ForEach-Object { [System.Drawing.Point]::new($_[0],$_[1]) })
}
function FillPolygon($graphics, $brush, [int[][]]$pairs) { $graphics.FillPolygon($brush, (Points $pairs)) }
function DrawPolygon($graphics, $pen, [int[][]]$pairs) { $graphics.DrawPolygon($pen, (Points $pairs)) }

function Draw-Backdrop($g, [System.Drawing.Color]$color, [string]$category, [int]$seed) {
  $dark = Darken $color 65
  $light = Lighten $color 45
  $darkBrush = [System.Drawing.SolidBrush]::new($dark)
  $lightBrush = [System.Drawing.SolidBrush]::new($light)
  $outline = [System.Drawing.Pen]::new((Color "#151b24"), 2)
  try {
    if ($category -eq "buffs") {
      $g.FillEllipse($darkBrush, 5, 7, 22, 22); $g.DrawEllipse($outline, 5, 7, 22, 22)
      FillPolygon $g $lightBrush @((2,13),(6,7),(9,13)); FillPolygon $g $lightBrush @((23,13),(26,7),(30,13))
    } else {
      $g.FillEllipse($darkBrush, 5, 4, 22, 22); $g.DrawEllipse($outline, 5, 4, 22, 22)
      FillPolygon $g $lightBrush @((3,21),(7,28),(10,21)); FillPolygon $g $lightBrush @((22,21),(25,29),(29,21))
    }
    for ($i=0; $i -lt 3; $i++) {
      $x = 2 + (($seed + $i*11) % 27); $y = 2 + (([Math]::Floor($seed / ($i+3)) + $i*7) % 27)
      $g.FillRectangle($lightBrush, $x, $y, 2, 2)
    }
  } finally { $darkBrush.Dispose(); $lightBrush.Dispose(); $outline.Dispose() }
}

function Draw-Arrow($g, [System.Drawing.Color]$color, [bool]$up) {
  $fill=[System.Drawing.SolidBrush]::new($color); $shine=[System.Drawing.SolidBrush]::new((Lighten $color 75)); $pen=[System.Drawing.Pen]::new((Color "#111720"),2)
  try {
    if ($up) { $shape=@((16,4),(27,16),(21,16),(21,27),(11,27),(11,16),(5,16)) }
    else { $shape=@((11,5),(21,5),(21,16),(27,16),(16,28),(5,16),(11,16)) }
    FillPolygon $g $fill $shape; DrawPolygon $g $pen $shape
    $g.FillRectangle($shine,13,8,3,12)
  } finally { $fill.Dispose(); $shine.Dispose(); $pen.Dispose() }
}
function Draw-Shield($g, [System.Drawing.Color]$color, [bool]$cracked) {
  $fill=[System.Drawing.SolidBrush]::new($color); $shine=[System.Drawing.SolidBrush]::new((Lighten $color 75)); $pen=[System.Drawing.Pen]::new((Color "#111720"),2)
  try {
    $shape=@((16,4),(27,8),(25,20),(16,28),(7,20),(5,8)); FillPolygon $g $fill $shape; DrawPolygon $g $pen $shape
    $g.FillRectangle($shine,10,9,3,9)
    if ($cracked) { $g.DrawLines($pen,(Points @((17,7),(13,14),(18,16),(14,25)))) }
    else { Draw-Arrow $g (Lighten $color 35) $true }
  } finally { $fill.Dispose(); $shine.Dispose(); $pen.Dispose() }
}
function Draw-Boot($g, [System.Drawing.Color]$color, [bool]$up) {
  $fill=[System.Drawing.SolidBrush]::new($color); $shine=[System.Drawing.SolidBrush]::new((Lighten $color 75)); $pen=[System.Drawing.Pen]::new((Color "#111720"),2)
  try {
    $shape=@((8,5),(18,5),(18,17),(26,21),(27,27),(8,27),(5,23),(9,18)); FillPolygon $g $fill $shape; DrawPolygon $g $pen $shape
    $g.FillRectangle($shine,11,8,3,10)
    if ($up) { FillPolygon $g $shine @((22,5),(28,11),(25,11),(25,17),(20,17),(20,11),(17,11)) }
    else { FillPolygon $g $shine @((20,7),(25,7),(25,13),(28,13),(22,19),(16,13),(20,13)) }
  } finally { $fill.Dispose(); $shine.Dispose(); $pen.Dispose() }
}
function Draw-Heart($g, [System.Drawing.Color]$color, [bool]$broken) {
  $fill=[System.Drawing.SolidBrush]::new($color); $shine=[System.Drawing.SolidBrush]::new((Lighten $color 80)); $pen=[System.Drawing.Pen]::new((Color "#111720"),2)
  try {
    $path=[System.Drawing.Drawing2D.GraphicsPath]::new(); $path.AddArc(4,6,13,13,140,250); $path.AddArc(15,6,13,13,150,250); $path.AddLine(26,16,16,29); $path.AddLine(16,29,6,16); $path.CloseFigure()
    $g.FillPath($fill,$path); $g.DrawPath($pen,$path); $g.FillEllipse($shine,9,9,4,4)
    if ($broken) { $g.DrawLines($pen,(Points @((17,8),(13,15),(18,17),(14,25)))) }
    $path.Dispose()
  } finally { $fill.Dispose(); $shine.Dispose(); $pen.Dispose() }
}
function Draw-Eye($g, [System.Drawing.Color]$color, [bool]$crossed) {
  $fill=[System.Drawing.SolidBrush]::new($color); $white=[System.Drawing.SolidBrush]::new((Color "#f7f3e8")); $pen=[System.Drawing.Pen]::new((Color "#111720"),2)
  try {
    $shape=@((3,16),(8,9),(16,6),(24,9),(29,16),(24,23),(16,26),(8,23)); FillPolygon $g $white $shape; DrawPolygon $g $pen $shape
    $g.FillEllipse($fill,10,10,12,12); $g.DrawEllipse($pen,10,10,12,12); $g.FillRectangle($white,14,12,3,3)
    if ($crossed) { $g.DrawLine($pen,7,7,25,25); $g.DrawLine($pen,25,7,7,25) }
  } finally { $fill.Dispose(); $white.Dispose(); $pen.Dispose() }
}
function Draw-Cage($g, [System.Drawing.Color]$color) {
  $fill=[System.Drawing.SolidBrush]::new($color); $pen=[System.Drawing.Pen]::new((Color "#111720"),2); $shine=[System.Drawing.Pen]::new((Lighten $color 85),2)
  try {
    $g.FillEllipse($fill,5,4,22,8); $g.DrawEllipse($pen,5,4,22,8); $g.FillRectangle($fill,5,8,22,18); $g.DrawRectangle($pen,5,8,22,18)
    foreach($x in @(9,15,21,26)){ $g.DrawLine($pen,$x,8,$x,26) }; $g.DrawLine($shine,7,10,7,23)
  } finally { $fill.Dispose(); $pen.Dispose(); $shine.Dispose() }
}
function Draw-Hourglass($g, [System.Drawing.Color]$color) {
  $fill=[System.Drawing.SolidBrush]::new($color); $white=[System.Drawing.SolidBrush]::new((Color "#f7f3e8")); $pen=[System.Drawing.Pen]::new((Color "#111720"),2)
  try {
    $g.FillRectangle($fill,7,4,18,4); $g.FillRectangle($fill,7,24,18,4); $g.DrawRectangle($pen,7,4,18,4); $g.DrawRectangle($pen,7,24,18,4)
    $shape=@((10,8),(22,8),(20,14),(16,17),(12,14)); FillPolygon $g $white $shape; DrawPolygon $g $pen $shape
    $shape=@((12,18),(16,15),(20,18),(22,24),(10,24)); FillPolygon $g $white $shape; DrawPolygon $g $pen $shape
    $g.FillRectangle($fill,14,17,4,5)
  } finally { $fill.Dispose(); $white.Dispose(); $pen.Dispose() }
}
function Draw-Star($g, [System.Drawing.Color]$color, [bool]$down) {
  $fill=[System.Drawing.SolidBrush]::new($color); $shine=[System.Drawing.SolidBrush]::new((Lighten $color 85)); $pen=[System.Drawing.Pen]::new((Color "#111720"),2)
  try {
    $shape=@((16,3),(19,11),(28,11),(21,17),(24,27),(16,21),(8,27),(11,17),(4,11),(13,11)); FillPolygon $g $fill $shape; DrawPolygon $g $pen $shape; $g.FillRectangle($shine,14,8,3,5)
    if ($down) { $g.DrawLine($pen,7,5,25,27) }
  } finally { $fill.Dispose(); $shine.Dispose(); $pen.Dispose() }
}
function Draw-Sword($g, [System.Drawing.Color]$color, [bool]$down) {
  $fill=[System.Drawing.SolidBrush]::new($color); $shine=[System.Drawing.SolidBrush]::new((Lighten $color 85)); $pen=[System.Drawing.Pen]::new((Color "#111720"),2)
  try {
    $shape=@((22,3),(28,3),(27,9),(14,22),(10,18)); FillPolygon $g $fill $shape; DrawPolygon $g $pen $shape
    $g.DrawLine($pen,8,17,16,25); $g.DrawLine($pen,6,26,11,21); $g.FillRectangle($shine,22,6,2,5)
    if ($down) { Draw-Arrow $g (Darken $color 25) $false }
  } finally { $fill.Dispose(); $shine.Dispose(); $pen.Dispose() }
}

function Effect-Family([string]$category, [string]$id) {
  if ($category -eq "buffs") {
    if ($id -match "ring|ingrain|heart|growth|helping-hand") { return "heart" }
    if ($id -match "agility|step|wheel|autotomize|bounce|dig|dive|fly|wing|polish|shift-gear|tailwind|trailblaze|whirlwind|kinesis") { return "speed" }
    if ($id -match "armor|guard|defend|defense|harden|reflect|shelter|shield|stockpile|cotton") { return "shield" }
    if ($id -match "focus|lock-on|mind-reader|foresight|meditate|concentration") { return "eye" }
    if ($id -match "claw|punch|rage|swords|sharpen|howl") { return "sword" }
    return "power"
  }
  if ($id -match "anchor|bind|clamp|constrict|spin|infestation|seed|tomb|submission|telekinesis|cage|whirlpool|wrap|octolock|shackle|lock") { return "cage" }
  if ($id -match "blast-burn|cannon|beam|impact|assault|laser|wrecker|roar-of-time|frenzy-plant|eternabeam") { return "hourglass" }
  if ($id -match "bubble|cotton|web|hammer|wind|mud-shot|string|thread|tar-shot|spin-out|speed") { return "speed" }
  if ($id -match "acid|armor|crunch|scales|iron-tail|liquidation|leer|shell|smash|screech|shadow-bone|triple-arrows|guard") { return "shield" }
  if ($id -match "charm|tears|play-nice|memento|parting-shot|psychic-noise") { return "heart" }
  if ($id -match "glare|roar|scary|look|snarl|flash|odor-sleuth|miracle-eye") { return "eye" }
  if ($id -match "swipe|combat|lunge|kick|attack|growl|play-rough|spirit-break|power|overheat|storm|ball") { return "sword" }
  return "power"
}

function Move-Type([string]$id, [string]$category) {
  $lookup = $id
  if ($id -eq "curse-buff") { $lookup = "curse" }
  if ($moveTypes.ContainsKey($lookup) -and $typeColors.ContainsKey($moveTypes[$lookup])) { return $moveTypes[$lookup] }
  if ($category -eq "buffs") { return "grass" }
  return "poison"
}

function Read-IconIds([string]$category) {
  $readme = Get-Content -Raw -Encoding UTF8 (Join-Path $effectRoot "$category\README.md")
  [regex]::Matches($readme, '`([^`]+)\.png`') | ForEach-Object { $_.Groups[1].Value }
}

function Draw-Signature($g, [System.Drawing.Color]$color, [int]$ordinal) {
  $bright=[System.Drawing.SolidBrush]::new((Lighten $color 90)); $dark=[System.Drawing.SolidBrush]::new((Color "#151b24"))
  try {
    for($bit=0;$bit -lt 8;$bit++) {
      $brush = if (($ordinal -band (1 -shl $bit)) -ne 0) { $bright } else { $dark }
      $g.FillRectangle($brush,4+$bit*3,30,1,1)
    }
  } finally { $bright.Dispose(); $dark.Dispose() }
}

function Write-Icon([string]$category, [string]$id, [int]$ordinal) {
  $type = Move-Type $id $category; $base = Color $typeColors[$type]; $seed = Seed "$category/$id"
  $bitmap = [System.Drawing.Bitmap]::new(32,32,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $g.Clear([System.Drawing.Color]::Transparent); $g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::None; $g.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::Half
    Draw-Backdrop $g $base $category $seed
    $family = Effect-Family $category $id
    if ($family -eq "heart") { Draw-Heart $g $base ($category -eq "debuffs") }
    elseif ($family -eq "speed") { Draw-Boot $g $base ($category -eq "buffs") }
    elseif ($family -eq "shield") { Draw-Shield $g $base ($category -eq "debuffs") }
    elseif ($family -eq "eye") { Draw-Eye $g $base ($category -eq "debuffs") }
    elseif ($family -eq "cage") { Draw-Cage $g $base }
    elseif ($family -eq "hourglass") { Draw-Hourglass $g $base }
    elseif ($family -eq "sword") { Draw-Sword $g $base ($category -eq "debuffs") }
    else { Draw-Star $g $base ($category -eq "debuffs") }
    Draw-Signature $g $base $ordinal
    $output = Join-Path $effectRoot "$category\$id.png"; $bitmap.Save($output,[System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $g.Dispose(); $bitmap.Dispose() }
}

$counts=@{}
foreach ($category in @("buffs","debuffs")) {
  $ids=@(Read-IconIds $category)
  for($index=0;$index -lt $ids.Count;$index++) { Write-Icon $category $ids[$index] $index }
  $counts[$category]=$ids.Count
}
Write-Output "Generated $($counts.buffs) buff icons and $($counts.debuffs) debuff icons."
