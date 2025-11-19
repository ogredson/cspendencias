Add-Type -AssemblyName System.Net
Add-Type -AssemblyName System.IO
$prefix = "http://localhost:5500/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Servidor iniciado em $prefix"
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

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
  $response.Headers.Add("Access-Control-Allow-Origin","*")
  $response.Headers.Add("Access-Control-Allow-Methods","GET,POST,OPTIONS")
  $response.Headers.Add("Access-Control-Allow-Headers","Content-Type, Authorization")
  if ($request.HttpMethod -eq 'OPTIONS') {
    $response.StatusCode = 204
    $response.OutputStream.Close()
    continue
  }
  $path = $request.Url.AbsolutePath.TrimStart('/')
  if ($path -eq 'proxy/whatsapp/send-text') {
    try {
      $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
      $body = $reader.ReadToEnd()
      $payload = $null
      if ($body) { $payload = $body | ConvertFrom-Json }
      $token = $payload.token
      if (-not $token) { $token = $env:WHATSAPP_API_TOKEN }
      $phone = $payload.phone
      $message = $payload.message
      $uri = 'https://v2.speedchat.dev.br/api/whatsapp/send-text'
      $wr = [System.Net.HttpWebRequest]::Create($uri)
      $wr.Method = 'POST'
      $wr.ContentType = 'application/json'
      $wr.Accept = 'application/json'
      $wr.UserAgent = 'CS-Pendencias-Proxy'
      if ($token) { $wr.Headers['Authorization'] = $token }
      $outJson = (ConvertTo-Json @{ phone = $phone; message = $message })
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($outJson)
      $reqStream = $wr.GetRequestStream()
      $reqStream.Write($bytes, 0, $bytes.Length)
      $reqStream.Close()
      try {
        $resp2 = $wr.GetResponse()
        $rs = $resp2.GetResponseStream()
        $rdr = New-Object System.IO.StreamReader($rs)
        $respBody = $rdr.ReadToEnd()
        $outBytes = [System.Text.Encoding]::UTF8.GetBytes($respBody)
        $response.ContentType = 'application/json'
        $response.StatusCode = 200
        $response.ContentLength64 = $outBytes.Length
        $response.OutputStream.Write($outBytes, 0, $outBytes.Length)
      } catch [System.Net.WebException] {
        $errResp = $_.Exception.Response
        if ($errResp) {
          $rdr = New-Object System.IO.StreamReader($errResp.GetResponseStream())
          $errBody = $rdr.ReadToEnd()
          $response.StatusCode = [int]$errResp.StatusCode
          $response.ContentType = 'application/json'
          $outBytes = [System.Text.Encoding]::UTF8.GetBytes($errBody)
        } else {
          $response.StatusCode = 500
          $response.ContentType = 'application/json'
          $outBytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"proxy_error","message":"upstream unreachable"}')
        }
        $response.ContentLength64 = $outBytes.Length
        $response.OutputStream.Write($outBytes, 0, $outBytes.Length)
      }
    } catch {
      $response.StatusCode = 500
      $msg = [System.Text.Encoding]::UTF8.GetBytes('{"error":"proxy_exception"}')
      $response.ContentType = 'application/json'
      $response.ContentLength64 = $msg.Length
      $response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $response.OutputStream.Close()
    continue
  }
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