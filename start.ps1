$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if ($nodeCommand) { $nodePath = $nodeCommand.Source }
elseif (Test-Path -LiteralPath (Join-Path $PSScriptRoot '.tools/node.exe')) { $nodePath = Join-Path $PSScriptRoot '.tools/node.exe' }
else { throw 'Install Node.js 22 LTS or newer, then run this script again.' }
& $nodePath (Join-Path $PSScriptRoot 'start-server.mjs')
exit $LASTEXITCODE
