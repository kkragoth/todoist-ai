# Log in to the Todoist AI backend and set $env:TODOIST_AI_TOKEN for opencode.
#
# Must be DOT-SOURCED (not executed) so the variable lands in your session:
#   . .\scripts\set_token.ps1 [-Username u] [-Password p] [-ApiUrl http://localhost:8000]
#
# Params fall back to env, then to interactive prompts:
#   $env:TODO_API_URL  backend base URL (default http://localhost:8000)
#   $env:TODO_USER / $env:TODO_PASS.
#
# Backend must be running.

[CmdletBinding()]
param(
    [string]$Username = $env:TODO_USER,
    [string]$Password = $env:TODO_PASS,
    [string]$ApiUrl = $(if ($env:TODO_API_URL) { $env:TODO_API_URL } else { 'http://localhost:8000' })
)

$ApiUrl = $ApiUrl.TrimEnd('/')

if ([string]::IsNullOrWhiteSpace($Username)) {
    $Username = Read-Host 'todoist-ai username'
}
if ([string]::IsNullOrWhiteSpace($Password)) {
    $secure = Read-Host 'todoist-ai password' -AsSecureString
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

if ([string]::IsNullOrWhiteSpace($Username) -or [string]::IsNullOrWhiteSpace($Password)) {
    Write-Error 'set_token: username and password are required'
    return
}

try {
    $body = @{
        username = $Username
        password = $Password
    }
    $response = Invoke-RestMethod -Method Post -Uri "$ApiUrl/auth/token" `
        -ContentType 'application/x-www-form-urlencoded' -Body $body
} catch {
    Write-Error "set_token: backend unreachable at $ApiUrl — is it running? ($($_.Exception.Message))"
    return
}

if ([string]::IsNullOrWhiteSpace($response.access_token)) {
    Write-Error "set_token: login failed — $($response | ConvertTo-Json -Compress)"
    return
}

$env:TODOIST_AI_TOKEN = $response.access_token
"TODOIST_AI_TOKEN set ($($env:TODOIST_AI_TOKEN.Length) chars) for $ApiUrl"
'Launch opencode from this session so it picks up {env:TODOIST_AI_TOKEN}.'
