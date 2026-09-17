# 数码报单系统 数据备份脚本
# 内容:SQLite 在线备份(sqlite3 .backup,服务运行中也可安全执行)+ 实名照片目录
# 保留:最近 14 份,自动清理更早的
# 手动执行:powershell -ExecutionPolicy Bypass -File backup.ps1
# 注册每日 23:30 计划任务(以管理员运行一次):
#   schtasks /Create /TN "baodan-backup" /SC DAILY /ST 23:30 /TR "powershell -ExecutionPolicy Bypass -File E:\数码报单\scripts\backup.ps1"

$ErrorActionPreference = 'Stop'

$dbPath      = 'D:\baodan-data\baodan.db'
$uploadsDir  = 'D:\baodan-data\uploads'
$backupRoot  = 'D:\baodan-data\backups'
$keep        = 14
$sqlite3     = 'C:\Users\Administrator\Tools\platform-tools\platform-tools\sqlite3.exe'

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dest  = Join-Path $backupRoot $stamp
New-Item -ItemType Directory -Path $dest -Force | Out-Null

# 1) SQLite 在线备份(原子、免锁死)
& $sqlite3 $dbPath ".backup '$dest\baodan.db'"
if ($LASTEXITCODE -ne 0) { throw "sqlite3 backup failed with $LASTEXITCODE" }

# 2) 实名照片(体积小,整目录复制)
if (Test-Path $uploadsDir) {
  Copy-Item -Path $uploadsDir -Destination $dest -Recurse -Force
}

# 3) 清理过期备份
Get-ChildItem -Path $backupRoot -Directory | Sort-Object Name -Descending |
  Select-Object -Skip $keep | Remove-Item -Recurse -Force

Write-Host "[backup] OK -> $dest"
