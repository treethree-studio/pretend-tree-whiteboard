$ErrorActionPreference = 'Stop'
$ProgressPreference = 'Continue'
$ElectronVersion = '44.3.0'
$ProductName = '假装一棵树'
$AppId = 'PretendTreeWhiteboard'
$InstallDir = Join-Path $env:LOCALAPPDATA $AppId
$PackageRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$AppSource = Join-Path $PackageRoot 'app'
$TempRoot = Join-Path $env:TEMP ("pretend-tree-install-" + [Guid]::NewGuid().ToString('N'))
$ZipPath = Join-Path $TempRoot 'electron.zip'
$RuntimeDir = Join-Path $TempRoot 'runtime'
$BundledZip = Join-Path $PackageRoot "electron-v$ElectronVersion-win32-x64.zip"
$LogPath = Join-Path $PackageRoot 'install-log.txt'
$DownloadUrls = @(
  "https://mirrors.huaweicloud.com/electron/$ElectronVersion/electron-v$ElectronVersion-win32-x64.zip",
  "https://github.com/electron/electron/releases/download/v$ElectronVersion/electron-v$ElectronVersion-win32-x64.zip"
)

function Write-Step($Text) {
  Write-Host "`n▶ $Text" -ForegroundColor Cyan
}

function Download-File($Url, $Destination) {
  Write-Host "下载地址：$Url" -ForegroundColor DarkGray

  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($curl) {
    Write-Host '使用 Windows curl 下载（失败会自动重试）...' -ForegroundColor DarkGray
    & curl.exe -L --fail --retry 2 --retry-delay 2 --connect-timeout 20 -o $Destination $Url
    if ($LASTEXITCODE -eq 0 -and (Test-Path $Destination) -and (Get-Item $Destination).Length -gt 100MB) {
      return $true
    }
    Remove-Item $Destination -Force -ErrorAction SilentlyContinue
  }

  Write-Host 'curl 未成功，尝试 Windows BITS 下载...' -ForegroundColor DarkGray
  try {
    Import-Module BitsTransfer -ErrorAction Stop
    Start-BitsTransfer -Source $Url -Destination $Destination -ErrorAction Stop
    if ((Test-Path $Destination) -and (Get-Item $Destination).Length -gt 100MB) {
      return $true
    }
  } catch {
    Remove-Item $Destination -Force -ErrorAction SilentlyContinue
  }

  Write-Host 'BITS 未成功，改用 PowerShell 下载...' -ForegroundColor DarkGray
  try {
    Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing -TimeoutSec 180
    if ((Test-Path $Destination) -and (Get-Item $Destination).Length -gt 100MB) {
      return $true
    }
  } catch {
    Write-Host ("该下载源失败：" + $_.Exception.Message) -ForegroundColor Yellow
  }
  Remove-Item $Destination -Force -ErrorAction SilentlyContinue
  return $false
}

$TranscriptStarted = $false
try {
  try {
    Start-Transcript -Path $LogPath -Force | Out-Null
    $TranscriptStarted = $true
  } catch {}

  Write-Host '========================================' -ForegroundColor DarkGray
  Write-Host "      安装 $ProductName" -ForegroundColor White
  Write-Host '========================================' -ForegroundColor DarkGray
  Write-Host ("系统：" + [Environment]::OSVersion.VersionString) -ForegroundColor DarkGray
  Write-Host ("安装目录：" + $InstallDir) -ForegroundColor DarkGray

  if (-not [Environment]::Is64BitOperatingSystem) {
    throw '当前是 32 位 Windows，本测试版仅支持 Windows 10 / 11 x64。'
  }
  if (-not (Test-Path $AppSource)) {
    throw '安装包不完整：找不到 app 目录。请完整解压 ZIP 后再安装。'
  }
  if (-not (Test-Path (Join-Path $AppSource 'main.js'))) {
    throw '安装包不完整：找不到 app\main.js。'
  }

  Write-Step '准备临时目录'
  New-Item -ItemType Directory -Path $TempRoot -Force | Out-Null

  if ((Test-Path $BundledZip) -and (Get-Item $BundledZip).Length -gt 100MB) {
    Write-Step '发现本地 Electron 运行环境，跳过联网下载'
    Copy-Item $BundledZip $ZipPath -Force
  } else {
    Write-Step "下载桌面运行环境 Electron $ElectronVersion"
    Write-Host '约 151 MB。下载速度取决于网络，请不要关闭当前窗口。' -ForegroundColor Yellow
    $Downloaded = $false
    foreach ($Url in $DownloadUrls) {
      if (Download-File $Url $ZipPath) {
        $Downloaded = $true
        break
      }
    }
    if (-not $Downloaded) {
      throw 'Electron 运行环境下载失败。请检查网络；也可以手动下载 electron-v44.3.0-win32-x64.zip 并放到项目根目录后重新安装。'
    }
  }

  $zipSizeMB = [Math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
  Write-Host "运行环境下载完成：$zipSizeMB MB" -ForegroundColor Green

  Write-Step '检查并解压运行环境'
  try {
    Expand-Archive -Path $ZipPath -DestinationPath $RuntimeDir -Force
  } catch {
    throw ("运行环境 ZIP 解压失败，文件可能没有下载完整：" + $_.Exception.Message)
  }
  if (-not (Test-Path (Join-Path $RuntimeDir 'electron.exe'))) {
    throw '运行环境解压后找不到 electron.exe。'
  }

  Write-Step '安装应用文件'
  if (Test-Path $InstallDir) {
    try {
      Get-Process -Name $ProductName -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    } catch {}
    Start-Sleep -Milliseconds 500
    Remove-Item $InstallDir -Recurse -Force
  }
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  Copy-Item (Join-Path $RuntimeDir '*') $InstallDir -Recurse -Force

  $ResourcesApp = Join-Path $InstallDir 'resources\app'
  New-Item -ItemType Directory -Path $ResourcesApp -Force | Out-Null
  Copy-Item (Join-Path $AppSource '*') $ResourcesApp -Recurse -Force

  $OldExe = Join-Path $InstallDir 'electron.exe'
  $ExePath = Join-Path $InstallDir "$ProductName.exe"
  Rename-Item $OldExe "$ProductName.exe" -Force
  if (-not (Test-Path $ExePath)) { throw '应用主程序部署失败。' }

  $IconPath = Join-Path $ResourcesApp 'assets\app.ico'

  Write-Step '创建桌面与开始菜单快捷方式'
  $Shell = New-Object -ComObject WScript.Shell
  $Desktop = [Environment]::GetFolderPath('Desktop')
  $DesktopLink = $Shell.CreateShortcut((Join-Path $Desktop "$ProductName.lnk"))
  $DesktopLink.TargetPath = $ExePath
  $DesktopLink.WorkingDirectory = $InstallDir
  if (Test-Path $IconPath) { $DesktopLink.IconLocation = "$IconPath,0" }
  $DesktopLink.Save()

  $StartMenuDir = Join-Path ([Environment]::GetFolderPath('Programs')) $ProductName
  New-Item -ItemType Directory -Path $StartMenuDir -Force | Out-Null
  $StartLink = $Shell.CreateShortcut((Join-Path $StartMenuDir "$ProductName.lnk"))
  $StartLink.TargetPath = $ExePath
  $StartLink.WorkingDirectory = $InstallDir
  if (Test-Path $IconPath) { $StartLink.IconLocation = "$IconPath,0" }
  $StartLink.Save()

  Write-Step '注册 .treeboard 文件关联'
  $Classes = 'HKCU:\Software\Classes'
  New-Item "$Classes\.treeboard" -Force | Out-Null
  Set-ItemProperty "$Classes\.treeboard" -Name '(Default)' -Value 'PretendTree.treeboard'
  New-Item "$Classes\PretendTree.treeboard" -Force | Out-Null
  Set-ItemProperty "$Classes\PretendTree.treeboard" -Name '(Default)' -Value "$ProductName 白板"
  New-Item "$Classes\PretendTree.treeboard\DefaultIcon" -Force | Out-Null
  Set-ItemProperty "$Classes\PretendTree.treeboard\DefaultIcon" -Name '(Default)' -Value "$IconPath,0"
  New-Item "$Classes\PretendTree.treeboard\shell\open\command" -Force | Out-Null
  Set-ItemProperty "$Classes\PretendTree.treeboard\shell\open\command" -Name '(Default)' -Value ('"' + $ExePath + '" "%1"')

  Write-Step '写入卸载信息'
  $InstalledUninstall = Join-Path $InstallDir 'uninstall.ps1'
  Copy-Item (Join-Path $PackageRoot 'installer\uninstall.ps1') $InstalledUninstall -Force
  $UninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\PretendTreeWhiteboard'
  New-Item $UninstallKey -Force | Out-Null
  Set-ItemProperty $UninstallKey -Name DisplayName -Value $ProductName
  Set-ItemProperty $UninstallKey -Name DisplayVersion -Value '0.1.0-alpha'
  Set-ItemProperty $UninstallKey -Name Publisher -Value $ProductName
  if (Test-Path $IconPath) { Set-ItemProperty $UninstallKey -Name DisplayIcon -Value $IconPath }
  Set-ItemProperty $UninstallKey -Name InstallLocation -Value $InstallDir
  Set-ItemProperty $UninstallKey -Name UninstallString -Value ('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $InstalledUninstall + '"')

  $UninstallLink = $Shell.CreateShortcut((Join-Path $StartMenuDir "卸载 $ProductName.lnk"))
  $UninstallLink.TargetPath = 'powershell.exe'
  $UninstallLink.Arguments = ('-NoProfile -ExecutionPolicy Bypass -File "' + $InstalledUninstall + '"')
  $UninstallLink.Save()

  Write-Step '安装完成，正在启动软件'
  Write-Host "安装位置：$InstallDir" -ForegroundColor Green
  Write-Host "安装日志：$LogPath" -ForegroundColor DarkGray
  Start-Process -FilePath $ExePath -WorkingDirectory $InstallDir
  exit 0
}
catch {
  Write-Host "`n安装失败：$($_.Exception.Message)" -ForegroundColor Red
  Write-Host "详细日志：$LogPath" -ForegroundColor Yellow
  exit 1
}
finally {
  if ($TranscriptStarted) {
    try { Stop-Transcript | Out-Null } catch {}
  }
  if (Test-Path $TempRoot) {
    Remove-Item $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
