# Windows: 작업 스케줄러에 매일 실행 작업 등록 (기본 07:10).
#   powershell -ExecutionPolicy Bypass -File scripts\install_task_windows.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\install_task_windows.ps1 -Time 06:30
param([string]$Time = "07:10")
$dir = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force -Path (Join-Path $dir "data") | Out-Null
$action = New-ScheduledTaskAction -Execute (Join-Path $dir "scripts\run_daily.cmd") -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
# PC가 꺼져 있어 시각을 놓쳤으면 켜진 뒤 바로 실행
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 3)
Register-ScheduledTask -TaskName "RealEstateDailyReport" -Action $action -Trigger $trigger `
  -Settings $settings -Description "네이버페이 부동산/법원경매/호갱노노 일일 리포트" -Force | Out-Null
Write-Host "등록됨: 매일 $Time  (작업 이름: RealEstateDailyReport)"
Write-Host "지금 한 번 실행: Start-ScheduledTask -TaskName RealEstateDailyReport"
