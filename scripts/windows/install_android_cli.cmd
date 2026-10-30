@echo off
rem ============================================================
rem Khaaos Run - Android CLI (sdkmanager) - instalador Windows
rem ============================================================
rem Versao robusta e 100% executavel do comando P1 (uma linha):
rem   curl.exe -fsSL https://dl.google.com/android/cli/latest/windows_x86_64/install.cmd -o "%TEMP%\i.cmd" && "%TEMP%\i.cmd"
rem
rem Por que um script? A linha unica falha em silencio quando:
rem   - curl.exe nao existe (Windows < 10 1803);
rem   - a rede cai e o %TEMP%\i.cmd fica STALE de uma execucao anterior
rem     (o && protege o curl, mas um arquivo velho pode ser rodado);
rem   - %TEMP% nao existe/nao e gravavel.
rem Este .cmd: valida curl.exe, usa arquivo temporario UNICO, confere
rem o download (existe e nao-vazio), propaga o exit code do instalador
rem e limpa o temporario. Equivalente PowerShell: install_android_cli.ps1
rem ============================================================
setlocal EnableExtensions

set "KHAOS_URL=https://dl.google.com/android/cli/latest/windows_x86_64/install.cmd"
set "KHAOS_TMP=%TEMP%\khaaos_android_cli_install_%RANDOM%.cmd"

echo [khaaos-android-cli] 1/4 - validando curl.exe ...
where curl.exe >nul 2>nul
if errorlevel 1 (
  echo [khaaos-android-cli] ERRO: curl.exe nao encontrado no PATH.
  echo [khaaos-android-cli] O curl.exe vem nativo no Windows 10 1803+. Alternativa:
  echo   powershell -ExecutionPolicy Bypass -File "%~dp0install_android_cli.ps1"
  exit /b 9009
)

echo [khaaos-android-cli] 2/4 - validando TEMP gravavel ...
if not defined TEMP (
  echo [khaaos-android-cli] ERRO: variavel TEMP nao definida.
  exit /b 1
)
if not exist "%TEMP%\" (
  echo [khaaos-android-cli] ERRO: pasta TEMP nao existe: %TEMP%
  exit /b 1
)

echo [khaaos-android-cli] 3/4 - baixando instalador oficial do Android CLI ...
curl.exe -fsSL -o "%KHAOS_TMP%" "%KHAOS_URL%"
set "CURL_RC=%errorlevel%"
if not "%CURL_RC%"=="0" (
  echo [khaaos-android-cli] ERRO: download falhou (curl exit %CURL_RC%).
  if exist "%KHAOS_TMP%" del /q "%KHAOS_TMP%" >nul 2>nul
  exit /b %CURL_RC%
)
if not exist "%KHAOS_TMP%" (
  echo [khaaos-android-cli] ERRO: arquivo temporario nao foi criado.
  exit /b 1
)
for %%A in ("%KHAOS_TMP%") do if %%~zA EQU 0 (
  echo [khaaos-android-cli] ERRO: download vazio (0 bytes) - rede/proxy bloqueou.
  del /q "%KHAOS_TMP%" >nul 2>nul
  exit /b 1
)

echo [khaaos-android-cli] 4/4 - executando o instalador oficial ...
call cmd /c ""%KHAOS_TMP%""
set "INSTALL_RC=%errorlevel%"
del /q "%KHAOS_TMP%" >nul 2>nul

if not "%INSTALL_RC%"=="0" (
  echo [khaaos-android-cli] AVISO: instalador saiu com codigo %INSTALL_RC% (leia os logs acima).
) else (
  echo [khaaos-android-cli] OK: Android CLI instalado. Use "sdkmanager" no novo terminal.
)
exit /b %INSTALL_RC%
