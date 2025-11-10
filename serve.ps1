Add-Type -AssemblyName System.Net
Add-Type -AssemblyName System.IO
$prefix = "http://localhost:5500/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Servidor iniciado em $prefix"

function Get-ContentType($path) {
  if ($path.EndsWith('.html')) { return 'text/html' }
  if ($path.EndsWith('.css')) { return 'text/css' }
  if ($path.EndsWith('.js')) { return 'application/javascript' }
  if ($path.EndsWith('.json')) { return 'application/json' }
  if ($path.EndsWith('.svg')) { return 'image/svg+xml' }
  if ($path.EndsWith('.png')) { return 'image/png' }
  if ($path.EndsWith('.jpg') -or $path.EndsWith('.jpeg')) { return 'image/jpeg' }
  return 'application/octet-stream'
}

while ($true) {
  $context = $listener.GetContext()
  $request = $context.Request
  $response = $context.Response
  $path = $request.Url.AbsolutePath.TrimStart('/')
  if ([string]::IsNullOrWhiteSpace($path)) { $path = 'index.html' }
  $localPath = Join-Path (Get-Location) $path
  if (Test-Path $localPath) {
    $bytes = [System.IO.File]::ReadAllBytes($localPath)
    $response.ContentType = Get-ContentType $localPath
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $response.StatusCode = 404
    $msg = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
    $response.OutputStream.Write($msg, 0, $msg.Length)
  }
  $response.OutputStream.Close()
}