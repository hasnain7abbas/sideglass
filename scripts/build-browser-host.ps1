$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $projectRoot "src\BrowserHost.cs"
$output = Join-Path $projectRoot "build\SideGlassBrowserHost.exe"
$compilerCandidates = @(
  "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
  "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)
$compiler = $compilerCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $compiler) {
  throw "The Windows .NET Framework C# compiler is required to build SideGlassBrowserHost.exe."
}

if ((Test-Path $output) -and (Get-Item $output).LastWriteTimeUtc -ge (Get-Item $source).LastWriteTimeUtc) {
  exit 0
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $output) | Out-Null
& $compiler /nologo /target:exe /optimize+ /platform:x64 /reference:System.Web.Extensions.dll "/out:$output" $source
if ($LASTEXITCODE -ne 0) {
  throw "Browser host compilation failed with exit code $LASTEXITCODE."
}
