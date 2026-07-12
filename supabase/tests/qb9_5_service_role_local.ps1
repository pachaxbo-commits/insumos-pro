$ErrorActionPreference = "Stop"

$status = npx supabase status -o json | ConvertFrom-Json
if ($status.API_URL -notmatch '^http://(127\.0\.0\.1|localhost):54321$') {
  throw "Non-local Supabase API detected."
}
if ($status.DB_URL -notmatch '@(127\.0\.0\.1|localhost):54322/') {
  throw "Non-local Supabase DB detected."
}
if (Test-Path "supabase/.temp/project-ref") {
  throw "A Supabase project ref is present."
}

$api = $status.API_URL
$key = $status.SERVICE_ROLE_KEY
$headers = @{
  apikey = $key
  Authorization = "Bearer $key"
  "Content-Type" = "application/json"
  Prefer = "return=minimal"
}

function Invoke-ExpectedDenied {
  param(
    [string]$Method,
    [string]$Uri,
    [string]$Body = $null
  )

  try {
    $parameters = @{
      Method = $Method
      Uri = $Uri
      Headers = $headers
    }
    if (-not [string]::IsNullOrEmpty($Body)) {
      $parameters.Body = $Body
    }

    Invoke-RestMethod @parameters | Out-Null
    throw "Expected service_role denial for $Method $Uri."
  } catch {
    $statusCode = [int]$_.Exception.Response.StatusCode
    if ($statusCode -notin @(401, 403, 404)) {
      throw
    }
  }
}

$profileUser = $null
$customerUser = $null
$auditMarker = "qb9_5_service_role_contract"

try {
  $authUsers = Invoke-RestMethod -Method Get -Uri "$api/auth/v1/admin/users?page=1&per_page=10" -Headers $headers
  if ($null -eq $authUsers.users) {
    throw "Admin Auth API listUsers did not return users."
  }

  $profileUser = Invoke-RestMethod -Method Post -Uri "$api/auth/v1/admin/users" -Headers $headers -Body (@{
    email = "qb95-profile-$([guid]::NewGuid().ToString('N'))@example.test"
    password = "QB95-local-Profile!"
    email_confirm = $true
  } | ConvertTo-Json)

  $customerUser = Invoke-RestMethod -Method Post -Uri "$api/auth/v1/admin/users" -Headers $headers -Body (@{
    email = "qb95-customer-$([guid]::NewGuid().ToString('N'))@example.test"
    password = "QB95-local-Customer!"
    email_confirm = $true
  } | ConvertTo-Json)

  Invoke-RestMethod -Method Post -Uri "$api/rest/v1/profiles" -Headers $headers -Body (@{
    id = $profileUser.id
    email = $profileUser.email
    full_name = "QB95 Profile Contract"
    role = "inventario"
    is_active = $true
  } | ConvertTo-Json) | Out-Null

  $profileRead = Invoke-RestMethod -Method Get -Uri "$api/rest/v1/profiles?select=id&id=eq.$($profileUser.id)" -Headers $headers
  if (@($profileRead).Count -ne 1) {
    throw "service_role could not read the profile it created."
  }

  Invoke-RestMethod -Method Post -Uri "$api/rest/v1/customer_accounts" -Headers $headers -Body (@{
    id = $customerUser.id
    email = $customerUser.email
    full_name = "QB95 Customer Contract"
    is_active = $true
  } | ConvertTo-Json) | Out-Null

  Invoke-RestMethod -Method Post -Uri "$api/rest/v1/audit_logs" -Headers $headers -Body (@{
    user_id = $profileUser.id
    action = "qb9_5_contract_test"
    entity_type = "service_role_contract"
    entity_id = $profileUser.id
    metadata = @{ marker = $auditMarker }
  } | ConvertTo-Json -Depth 4) | Out-Null

  Invoke-ExpectedDenied -Method Get -Uri "$api/rest/v1/products?select=id&limit=1"
  Invoke-ExpectedDenied -Method Get -Uri "$api/rest/v1/customer_accounts?select=id&limit=1"
  Invoke-ExpectedDenied -Method Patch -Uri "$api/rest/v1/profiles?id=eq.$($profileUser.id)" -Body (@{
    full_name = "Forbidden update"
  } | ConvertTo-Json)
  Invoke-ExpectedDenied -Method Post -Uri "$api/rest/v1/qb_orders" -Body (@{
    public_reference = "QB95-DIRECT-BLOCK"
  } | ConvertTo-Json)
  Invoke-ExpectedDenied -Method Post -Uri "$api/rest/v1/sales" -Body "{}"
  Invoke-ExpectedDenied -Method Post -Uri "$api/rest/v1/rpc/link_public_order_customer_account" -Body (@{
    p_order_id = [guid]::NewGuid()
    p_idempotency_key_hash = "blocked"
    p_customer_account_id = $customerUser.id
  } | ConvertTo-Json)

  Write-Output "QB-9.5 service_role local contract OK"
} finally {
  docker exec supabase_db_insumos-pro psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "delete from public.audit_logs where metadata->>'marker' = '$auditMarker';" | Out-Null

  if ($null -ne $profileUser) {
    try {
      Invoke-RestMethod -Method Delete -Uri "$api/auth/v1/admin/users/$($profileUser.id)" -Headers $headers | Out-Null
    } catch {
      Write-Warning "Could not remove the local profile test user."
    }
  }

  if ($null -ne $customerUser) {
    try {
      Invoke-RestMethod -Method Delete -Uri "$api/auth/v1/admin/users/$($customerUser.id)" -Headers $headers | Out-Null
    } catch {
      Write-Warning "Could not remove the local customer test user."
    }
  }
}
