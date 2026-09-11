$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
$ProductName = '假装一棵树'
$AppId = 'PretendTreeWhiteboard'
$InstallDir = Join-Path $env:LOCALAPPDATA $AppId

Get-Process | Where-Object { $_.Path -eq (Join-Path $InstallDir "$ProductName.exe") } | Stop-Process -Force

Remove-Item 'HKCU:\Software\Classes\.treeboard' -Recurse -Force
Remove-Item 'HKCU:\Software\Classes\PretendTree.treeboard' -Recurse -Force
Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\PretendTreeWhiteboard' -Recurse -Force

$DesktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) "$ProductName.lnk"
Remove-Item $DesktopLink -Force
$StartMenuDir = Join-Path ([Environment]::GetFolderPath('Programs')) $ProductName
Remove-Item $StartMenuDir -Recurse -Force

# 用户白板文件与设置数据不会随卸载删除。
Start-Sleep -Milliseconds 500
if (Test-Path $InstallDir) {
  $cmd = "timeout /t 2 /nobreak >nul & rmdir /s /q `"$InstallDir`""
  Start-Process cmd.exe -ArgumentList '/c', $cmd -WindowStyle Hidden
}

[System.Windows.Forms.MessageBox]::Show("$ProductName 已卸载。`n你的 .treeboard 白板文件不会被删除。", '卸载完成') | Out-Null
