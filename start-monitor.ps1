$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = "C:\Users\xiong\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$Pnpm = "C:\Users\xiong\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
$NodeBin = "C:\Users\xiong\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
$Node = Join-Path $NodeBin "node.exe"
$VenvPython = Join-Path $ProjectRoot ".venv\\Scripts\\python.exe"
$env:Path = "$NodeBin;$env:Path"

function Start-HiddenProcess {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string]$Arguments
  )
  $Info = New-Object System.Diagnostics.ProcessStartInfo
  $Info.FileName = $FilePath
  $Info.Arguments = $Arguments
  $Info.WorkingDirectory = $ProjectRoot
  $Info.UseShellExecute = $true
  $Info.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  return [System.Diagnostics.Process]::Start($Info)
}

if (-not (Test-Path $VenvPython)) {
  & $Python -m venv (Join-Path $ProjectRoot ".venv")
  & $VenvPython -m pip install -r (Join-Path $ProjectRoot "agent\\requirements.txt")
}

if (-not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
  Set-Location $ProjectRoot
  & $Pnpm install
}

Set-Location $ProjectRoot
if (-not (Test-Path (Join-Path $ProjectRoot "dist\\server\\index.js"))) {
  & $Pnpm run build
}

$AgentScript = Join-Path $ProjectRoot "agent\\server.py"
$GatewayScript = Join-Path $ProjectRoot "agent\\gateway.py"
$VinextCli = Join-Path $ProjectRoot "node_modules\\vinext\\dist\\cli.js"
$AgentProcess = Start-HiddenProcess -FilePath $VenvPython -Arguments ('"' + $AgentScript + '"')
$WebProcess = Start-HiddenProcess -FilePath $Node -Arguments ('"' + $VinextCli + '" start --port 3001 --hostname 127.0.0.1')

Write-Host ""
Write-Host "HK iPhone stock monitor is starting" -ForegroundColor Green
Write-Host "Computer: http://localhost:3000"
$LanAddress = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
  Where-Object { $_.AddressFamily -eq 'InterNetwork' -and -not $_.IPAddressToString.StartsWith('127.') } |
  Select-Object -Last 1
if ($LanAddress) {
  Write-Host "Phone: http://$($LanAddress.IPAddressToString):3000 (same Wi-Fi required)"
}
Write-Host "Keep this window and the computer running. Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host ""
try {
  & $VenvPython $GatewayScript
}
finally {
  foreach ($ChildProcess in @($AgentProcess, $WebProcess)) {
    if ($ChildProcess -and -not $ChildProcess.HasExited) {
      $ChildProcess.Kill()
    }
  }
}
