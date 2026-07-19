# ContentHub - one-click Docker startup (production stack).
#
# Boots PostgreSQL + Redis + API + Web + Nginx behind a reverse proxy on
# http://localhost. Builds images if needed and starts detached.
#
# Usage:
#   .\start.ps1            build & start detached
#   .\start.ps1 -Build     force rebuild
#   .\start.ps1 -Down      stop and remove containers
#   .\start.ps1 -Clean     stop + wipe named volumes (pgdata, redisdata)

[CmdletBinding()]
param(
  [switch]$Build,
  [switch]$Down,
  [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$compose = 'docker compose -f docker-compose.prod.yml'

if ($Down) {
  Write-Host '[contenthub] stopping stack ...'
  & $compose down
  exit
}
if ($Clean) {
  Write-Host '[contenthub] stopping stack and wiping volumes ...'
  & $compose down -v
  exit
}

Write-Host '[contenthub] building & starting the stack (detached) ...'
& $compose up -d --build

Write-Host ''
Write-Host '==> ContentHub is up:  http://localhost'
Write-Host '    Frontend:          /'
Write-Host '    REST API:          /api/v1'
Write-Host '    Swagger UI:        /api/docs'
Write-Host '    Stop:              .\start.ps1 -Down'
Write-Host '    Wipe data:         .\start.ps1 -Clean'
