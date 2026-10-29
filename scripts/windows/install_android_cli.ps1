# ============================================================
# Khaaos Run - Android CLI (sdkmanager) - instalador Windows (PowerShell)
# ============================================================
# Fallback 100% executavel do comando P1 para maquinas sem curl.exe no PATH
# (Windows < 10 1803). Mesmo contrato do install_android_cli.cmd:
#   - baixa https://dl.google.com/android/cli/latest/windows_x86_64/install.cmd
#   - arquivo temporario UNICO em $env:TEMP (nunca stale)
#   - valida download (existe + nao-vazio)
#   - executa o instalador oficial e propaga o exit code
#   - limpa o temporario
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts\windows\install_android_cli.ps1
# ============================================================
$ErrorActionPreference = 'Stop'

$Url = 'https://dl.google.com/android/cli/latest/windows_x86_64/install.cmd'

function Fail($msg, $code) {
    Write-Host "[khaaos-android-cli] ERRO: $msg" -ForegroundColor Red
    exit $code
}

Write-Host "[khaaos-android-cli] 1/3 - baixando instalador oficial do Android CLI ..."
try {
    # TLS moderno (Windows antigos nao negociam 1.2 por padrao no .NET legado)
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $tmp = New-Item -Path (Join-Path $env:TEMP ("khaaos_android_cli_install_{0}.cmd" -f [guid]::NewGuid().ToString('N'))) -ItemType File -Force
    Invoke-WebRequest -Uri $Url -OutFile $tmp.FullName -UseBasicParsing
} catch {
    if ($tmp) { Remove-Item $tmp.FullName -ErrorAction SilentlyContinue }
    Fail "download falhou: $($_.Exception.Message)" 1
}

if (-not (Test-Path $tmp.FullName)) { Fail 'arquivo temporario nao foi criado' 1 }
if ((Get-Item $tmp.FullName).Length -eq 0) {
    Remove-Item $tmp.FullName -ErrorAction SilentlyContinue
    Fail 'download vazio (0 bytes) - rede/proxy bloqueou' 1
}

Write-Host "[khaaos-android-cli] 2/3 - executando o instalador oficial ..."
& cmd.exe /c "`"$($tmp.FullName)`""
$installRc = $LASTEXITCODE

Write-Host "[khaaos-android-cli] 3/3 - limpando temporario ..."
Remove-Item $tmp.FullName -ErrorAction SilentlyContinue

if ($installRc -ne 0) {
    Write-Host "[khaaos-android-cli] AVISO: instalador saiu com codigo $installRc (leia os logs acima)." -ForegroundColor Yellow
} else {
    Write-Host '[khaaos-android-cli] OK: Android CLI instalado. Use "sdkmanager" no novo terminal.' -ForegroundColor Green
}
exit $installRc
