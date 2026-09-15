[CmdletBinding()]
param(
    [string]$AvdName = "TaskChute_API33",
    [int]$BootTimeoutSeconds = 180,
    [string]$BaseUrl = "https://taskchute-web-nonprod.taskfulness-sync.workers.dev",
    [string[]]$Surface = @("All")
)

$ErrorActionPreference = "Stop"
$PackageName = "com.hedgetheapp.taskchute"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$SurfaceClasses = [ordered]@{
    Notes = "com.hedgetheapp.taskchute.document.NotesScreenInstrumentedTest"
    Today = "com.hedgetheapp.taskchute.today.TodayScreenInstrumentedTest"
    Security = "com.hedgetheapp.taskchute.security.EncryptedSessionStoreInstrumentedTest"
}

function Resolve-Surfaces([string[]]$Requested) {
    $expanded = @($Requested | ForEach-Object { $_ -split "," } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($expanded.Count -eq 0) {
        throw "Surface must be one or more of All, Notes, Today, Security."
    }

    $invalid = @($expanded | Where-Object { $_ -notin @("All", "Notes", "Today", "Security") })
    if ($invalid.Count -gt 0) {
        throw "Invalid instrumentation surface '$($invalid -join ', ')'. Choose All, Notes, Today, or Security."
    }
    if ($expanded.Count -gt 1) {
        throw "Multiple instrumentation surfaces are not supported by this Gradle runner. Run one of All, Notes, Today, or Security at a time."
    }
    return $expanded
}

function Resolve-SdkRoot {
    $localAppData = [Environment]::GetFolderPath("LocalApplicationData")
    $candidates = @(
        $env:ANDROID_SDK_ROOT,
        $env:ANDROID_HOME,
        (Join-Path $localAppData "Android\Sdk")
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

    foreach ($candidate in $candidates) {
        if ((Test-Path (Join-Path $candidate "platform-tools\adb.exe")) -and
            (Test-Path (Join-Path $candidate "emulator\emulator.exe"))) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    throw "Android SDK with platform-tools/adb.exe and emulator/emulator.exe was not found. Set ANDROID_SDK_ROOT or install it under %LOCALAPPDATA%\Android\Sdk."
}

function Get-ConnectedEmulator([string]$AdbPath) {
    $lines = @(& $AdbPath devices | Select-Object -Skip 1)
    $deviceLines = $lines | Where-Object { $_ -match '^\s*(emulator-\d+)\s+device\s*$' }
    if (-not $deviceLines) { return $null }
    $preferred = $deviceLines | Where-Object { $_ -match '^\s*emulator-5554\s+device\s*$' } | Select-Object -First 1
    $selected = if ($preferred) { $preferred } else { $deviceLines | Select-Object -First 1 }
    return ([regex]::Match($selected.Trim(), '^(\S+)\s+device$')).Groups[1].Value
}

function Wait-ForEmulator([string]$AdbPath, [int]$TimeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $serial = Get-ConnectedEmulator $AdbPath
        if ($serial) {
            $booted = (& $AdbPath -s $serial shell getprop sys.boot_completed 2>$null).Trim()
            if ($booted -eq "1") {
                return $serial
            }
        }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)

    throw "Emulator '$AvdName' did not reach sys.boot_completed=1 within $TimeoutSeconds seconds."
}

$selectedSurfaces = @(Resolve-Surfaces $Surface)
$surfaceLabel = $selectedSurfaces -join ","
$totalTimer = [Diagnostics.Stopwatch]::StartNew()

$sdkRoot = Resolve-SdkRoot
$adb = Join-Path $sdkRoot "platform-tools\adb.exe"
$emulator = Join-Path $sdkRoot "emulator\emulator.exe"

# Android emulator discovery uses the user's AVD directory. Set these only for
# this process so the helper also works when the shell did not inherit them.
$androidUserHome = Join-Path $env:USERPROFILE ".android"
$androidAvdHome = Join-Path $androidUserHome "avd"
if (Test-Path -LiteralPath $androidUserHome) {
    $env:ANDROID_USER_HOME = $androidUserHome
}
if (Test-Path -LiteralPath $androidAvdHome) {
    $env:ANDROID_AVD_HOME = $androidAvdHome
}

Write-Host "Android SDK: $sdkRoot"
Write-Host "AVD: $AvdName"
Write-Host "TaskChute base URL: $BaseUrl"
Write-Host "Instrumentation surface(s): $surfaceLabel"

$avds = @(& $emulator -list-avds)
if ($avds -notcontains $AvdName) {
    throw "Required AVD '$AvdName' was not found. Available AVDs: $($avds -join ', ')"
}

$emulatorTimer = [Diagnostics.Stopwatch]::StartNew()
$serial = Get-ConnectedEmulator $adb
if (-not $serial) {
    Write-Host "No connected emulator found; starting '$AvdName'."
    Start-Process -FilePath $emulator -ArgumentList @("-avd", $AvdName, "-no-snapshot-load", "-no-boot-anim") -WindowStyle Hidden | Out-Null
    $serial = Wait-ForEmulator $adb $BootTimeoutSeconds
} else {
    $booted = (& $adb -s $serial shell getprop sys.boot_completed 2>$null).Trim()
    if ($booted -ne "1") {
        $serial = Wait-ForEmulator $adb $BootTimeoutSeconds
    }
}
$emulatorTimer.Stop()

Write-Host "ADB device: $serial"
& $adb -s $serial logcat -c

$testExitCode = 1
$instrumentationTimer = [Diagnostics.Stopwatch]::StartNew()
Push-Location (Join-Path $RepoRoot "apps\android")
try {
    $gradleArgs = @(
        "--no-daemon",
        ":app:connectedDebugAndroidTest",
        "-Ptaskchute.baseUrl=$BaseUrl"
    )
    if ($selectedSurfaces -notcontains "All") {
        $classFilter = ($selectedSurfaces | ForEach-Object { $SurfaceClasses[$_] }) -join ","
        $gradleArgs += "-Pandroid.testInstrumentationRunnerArguments.class=$classFilter"
    }
    & .\gradlew.bat @gradleArgs
    $testExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}
$instrumentationTimer.Stop()

$smokeTimer = [Diagnostics.Stopwatch]::StartNew()
$smokeExitCode = 0
$debugApk = Join-Path $RepoRoot "apps\android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path -LiteralPath $debugApk) {
    Write-Host "Installing debug APK for post-test smoke readiness: $debugApk"
    & $adb -s $serial install -r $debugApk
    Write-Host "Resolved activity after debug APK install:"
    $activityOutput = @(& $adb -s $serial shell cmd package resolve-activity --brief $PackageName)
    $activityOutput | Write-Output
    if (-not $activityOutput -or ($activityOutput -match "No activity found")) {
        Write-Error "No launchable activity resolved for $PackageName"
        $smokeExitCode = 1
    }
} else {
    Write-Error "Debug APK was not produced: $debugApk"
    $smokeExitCode = 1
}

$crashLines = @(& $adb -s $serial logcat -b crash -d | Where-Object { $_ -match [regex]::Escape($PackageName) })
if ($crashLines.Count -gt 0) {
    Write-Error "Application crash entries detected:"
    $crashLines | Select-Object -Last 40 | Write-Output
    $crashExitCode = 1
} else {
    Write-Host "Crash log: no entries for $PackageName"
    $crashExitCode = 0
}
$smokeTimer.Stop()
$totalTimer.Stop()

Write-Host "Instrumentation exit code: $testExitCode"
Write-Host ("Timing: emulator ready/startup {0:N2}s; instrumentation {1:N2}s; post-test install/smoke {2:N2}s; total {3:N2}s; surface(s)={4}" -f $emulatorTimer.Elapsed.TotalSeconds, $instrumentationTimer.Elapsed.TotalSeconds, $smokeTimer.Elapsed.TotalSeconds, $totalTimer.Elapsed.TotalSeconds, $surfaceLabel)
if ($testExitCode -ne 0 -or $crashExitCode -ne 0 -or $smokeExitCode -ne 0) {
    exit 1
}

Write-Host "Android QA PASS"
exit 0
