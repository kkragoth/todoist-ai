# Register a new user on the Todoist AI backend.
#
# Executed (not dot-sourced):
#   .\scripts\register.ps1 [-Username u] [-Password p] [-ApiUrl http://localhost:8000]
#
# Params fall back to env, then to interactive prompts:
#   $env:TODO_API_URL  backend base URL (default http://localhost:8000)
#   $env:TODO_USER / $env:TODO_PASS.
#
# Backend must be running.
# Next step: run `opencode mcp auth todoist-ai` and log in as this user.

[CmdletBinding()]
param(
    [string]$Username = $env:TODO_USER,
    [string]$Password = $env:TODO_PASS,
    [string]$ApiUrl = $(if ($env:TODO_API_URL) { $env:TODO_API_URL } else { 'http://localhost:8000' })
)

$ApiUrl = $ApiUrl.TrimEnd('/')

if ([string]::IsNullOrWhiteSpace($Username)) {
    $Username = Read-Host 'new username'
}
if ([string]::IsNullOrWhiteSpace($Password)) {
    $secure = Read-Host 'new password' -AsSecureString
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

if ([string]::IsNullOrWhiteSpace($Username) -or [string]::IsNullOrWhiteSpace($Password)) {
    Write-Error 'register: username and password are required'
    return
}

try {
    $payload = @{ username = $Username; password = $Password } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri "$ApiUrl/auth/register" `
        -ContentType 'application/json' -Body $payload | ConvertTo-Json
} catch {
    $detail = $_.ErrorDetails.Message
    if ([string]::IsNullOrWhiteSpace($detail)) { $detail = $_.Exception.Message }
    Write-Error "register: request failed — $detail"
}
