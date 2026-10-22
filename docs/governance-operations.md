# Governance operations

Only the operator chooses and knows the governance code. Do not paste it into chat, a command argument, a file, or the repository.

From PowerShell in the repository, set or rotate the secret with these exact steps:

```powershell
Set-Location C:\Users\flipo\src\dash\worker
$govSecure = Read-Host 'Choose governance code (private)' -AsSecureString
$govPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($govSecure)
try {
  $govPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($govPtr)
  $govBytes = [Text.Encoding]::UTF8.GetBytes($govPlain)
  $govSha = [Security.Cryptography.SHA256]::Create()
  $govHash = ([BitConverter]::ToString($govSha.ComputeHash($govBytes))).Replace('-', '').ToLowerInvariant()
  $govHash | npx --offline wrangler secret put GOVERNANCE_CODE_HASH
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($govPtr)
  if ($govBytes) { [Array]::Clear($govBytes, 0, $govBytes.Length) }
  $govPlain = $null; $govHash = $null; $govSecure = $null
  if ($govSha) { $govSha.Dispose() }
}
```

After deployment, refresh the dash, open Information Flow, choose **Unlock governance (15 min)**, and enter the same code. It stays private; the browser keeps only the returned token in page memory. Reloading or locking the page drops that token. Every save checks expiry and signature at the worker.

Rotation: repeat the steps with a new code. Existing unlock tokens immediately fail validation against the new hash. All 41 existing bindings must remain; adding this requested secret makes 42 total. The gate adds no cron.

Lockout recovery: remove GOVERNANCE_CODE_HASH in Cloudflare's worker settings, which keeps governance writes locked; then set a new hash using the steps above. Do not remove any other secret. There is no bypass or gate-off flag. Do not expose the hash or code in logs or reports.

Refused attempts are in `governance:attempts`; `getGovernanceAttempts` needs a normal dashboard session and returns the latest 50 with the blocked count. It contains hashes and sizes, never the submitted content. The authority itself is unchanged by a refused write. Writing an already mapped asset is independent of this gate.

Current Methods is permanently unlocked (cb820e32). The Graph-only gate and baseline approval retain the same code, signature, expiry and fail-closed behavior. The watcher adds one daily 00:30 UTC cron, bringing the total to six. Its seeded baseline is explicitly marked until the operator unlocks and chooses Approve current state as baseline. The report observes Worksheet drift but does not gate its edits.
