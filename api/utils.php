<?php
declare(strict_types=1);

if (!function_exists('mb_strlen')) {
    function mb_strlen(string $string, ?string $encoding = null): int
    {
        return strlen($string);
    }
}

if (!function_exists('mb_substr')) {
    function mb_substr(string $string, int $start, ?int $length = null, ?string $encoding = null): string
    {
        return $length === null ? substr($string, $start) : substr($string, $start, $length);
    }
}

if (!function_exists('mb_strtolower')) {
    function mb_strtolower(string $string, ?string $encoding = null): string
    {
        return strtolower($string);
    }
}

function respond(int $status, array $payload): void
{
    http_response_code($status);
    $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($body === false) {
        $body = '{"ok":false,"error":"Failed to encode JSON response"}';
    }
    echo $body;
    exit;
}

function respondSemanticSearch(int $status, array $payload): void
{
    $isDegraded = ($payload['degraded'] ?? false) === true
        || (($payload['cache_source'] ?? '') === 'local-records')
        || (($payload['retrieval_source'] ?? '') === 'lexical_fallback');
    $cacheControl = $isDegraded
        ? 'private, max-age=60, stale-while-revalidate=300'
        : 'private, max-age=600, stale-while-revalidate=21600';
    header('Cache-Control: ' . $cacheControl, true);
    header('Vary: Accept', true);
    header_remove('Pragma');
    respond($status, $payload);
}

function cleanText($value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $value = trim($value);
    if ($value === '' || strtolower($value) === 'unknown' || strtolower($value) === 'null') {
        return null;
    }
    return $value;
}

function validWebsite(?string $website): ?string
{
    if ($website === null) {
        return null;
    }
    $website = preg_replace('/\s*\(.*$/', '', $website);
    $website = trim((string)$website);
    if ($website === '') {
        return null;
    }
    if (!preg_match('#^https?://#i', $website)) {
        $website = 'https://' . ltrim($website, '/');
    }
    return filter_var($website, FILTER_VALIDATE_URL) ? $website : null;
}

function readJsonRequestBody(): array
{
    $raw = @file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function requireSameHostReferrer(): void
{
    $referrer = $_SERVER['HTTP_REFERER'] ?? '';
    if ($referrer === '') {
        respond(403, ['error' => 'Missing referrer']);
    }

    $host = strtolower((string)parse_url($referrer, PHP_URL_HOST));
    $serverHost = strtolower((string)($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? ''));
    $serverHost = preg_replace('/:\d+$/', '', $serverHost);
    $allowedHosts = ['mccullough.cloud', 'www.mccullough.cloud'];
    if (in_array($serverHost, ['127.0.0.1', 'localhost'], true)) {
        $allowedHosts[] = '127.0.0.1';
        $allowedHosts[] = 'localhost';
    }

    if (!in_array($host, $allowedHosts, true)) {
        respond(403, ['error' => 'Access denied']);
    }
}

function postJson(
    string $url,
    array $payload,
    int $timeoutSeconds = 20,
    ?string $searchHealthUrl = null,
    ?string $searchHomeDir = null,
    ?string $searchStartScript = null,
    ?string $embedHealthUrl = null,
    ?string $embedHomeDir = null,
    ?string $embedStartScript = null,
    ?string $stateFile = null,
    ?string $logFile = null,
    int $cooldownSeconds = 45
): array
{
    $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($body === false) {
        return ['ok' => false, 'status' => 500, 'error' => 'Failed to encode request payload'];
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\nConnection: close\r\n",
            'content' => $body,
            'timeout' => $timeoutSeconds,
            'ignore_errors' => true,
        ],
    ]);

    if (
        $searchHealthUrl && $searchHomeDir && $searchStartScript
        && $embedHealthUrl && $embedHomeDir && $embedStartScript
        && $stateFile && $logFile
    ) {
        ensureSemanticLane(
            $searchHealthUrl,
            $searchHomeDir,
            $searchStartScript,
            $embedHealthUrl,
            $embedHomeDir,
            $embedStartScript,
            $stateFile,
            $logFile,
            $cooldownSeconds,
            25,
            'request_preflight'
        );
    }

    $raw = @file_get_contents($url, false, $context);
    if ($raw === false) {
        if (
            $searchHealthUrl && $searchHomeDir && $searchStartScript
            && $embedHealthUrl && $embedHomeDir && $embedStartScript
            && $stateFile && $logFile
            && ensureSemanticLane(
                $searchHealthUrl,
                $searchHomeDir,
                $searchStartScript,
                $embedHealthUrl,
                $embedHomeDir,
                $embedStartScript,
                $stateFile,
                $logFile,
                $cooldownSeconds,
                35,
                'request_transport_retry'
            )
        ) {
            $raw = @file_get_contents($url, false, $context);
        }
        if ($raw === false) {
            return ['ok' => false, 'status' => 503, 'error' => 'Semantic search service unavailable'];
        }
    }

    $statusCode = 200;
    foreach ($http_response_header ?? [] as $header) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $header, $matches)) {
            $statusCode = (int)$matches[1];
            break;
        }
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return ['ok' => false, 'status' => 502, 'error' => 'Semantic search service returned invalid JSON'];
    }

    $shouldRetry = $statusCode >= 500 || (($decoded['ok'] ?? true) === false);
    if (
        $shouldRetry
        && $searchHealthUrl && $searchHomeDir && $searchStartScript
        && $embedHealthUrl && $embedHomeDir && $embedStartScript
        && $stateFile && $logFile
        && ensureSemanticLane(
            $searchHealthUrl,
            $searchHomeDir,
            $searchStartScript,
            $embedHealthUrl,
            $embedHomeDir,
            $embedStartScript,
            $stateFile,
            $logFile,
            $cooldownSeconds,
            35,
            'request_http_retry'
        )
    ) {
        $raw = @file_get_contents($url, false, $context);
        if ($raw !== false) {
            $statusCode = 200;
            foreach ($http_response_header ?? [] as $header) {
                if (preg_match('#^HTTP/\S+\s+(\d{3})#', $header, $matches)) {
                    $statusCode = (int)$matches[1];
                    break;
                }
            }
            $decoded = json_decode($raw, true);
        }
    }

    if (!is_array($decoded)) {
        return ['ok' => false, 'status' => 502, 'error' => 'Semantic search service returned invalid JSON'];
    }

    return ['ok' => true, 'status' => $statusCode, 'body' => $decoded];
}

function getJson(
    string $url,
    int $timeoutSeconds = 20,
    ?string $searchHealthUrl = null,
    ?string $searchHomeDir = null,
    ?string $searchStartScript = null,
    ?string $embedHealthUrl = null,
    ?string $embedHomeDir = null,
    ?string $embedStartScript = null,
    ?string $stateFile = null,
    ?string $logFile = null,
    int $cooldownSeconds = 45
): array
{
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => "Connection: close\r\n",
            'timeout' => $timeoutSeconds,
            'ignore_errors' => true,
        ],
    ]);

    if (
        $searchHealthUrl && $searchHomeDir && $searchStartScript
        && $embedHealthUrl && $embedHomeDir && $embedStartScript
        && $stateFile && $logFile
    ) {
        ensureSemanticLane(
            $searchHealthUrl,
            $searchHomeDir,
            $searchStartScript,
            $embedHealthUrl,
            $embedHomeDir,
            $embedStartScript,
            $stateFile,
            $logFile,
            $cooldownSeconds,
            25,
            'request_preflight'
        );
    }

    $raw = @file_get_contents($url, false, $context);
    if ($raw === false) {
        if (
            $searchHealthUrl && $searchHomeDir && $searchStartScript
            && $embedHealthUrl && $embedHomeDir && $embedStartScript
            && $stateFile && $logFile
            && ensureSemanticLane(
                $searchHealthUrl,
                $searchHomeDir,
                $searchStartScript,
                $embedHealthUrl,
                $embedHomeDir,
                $embedStartScript,
                $stateFile,
                $logFile,
                $cooldownSeconds,
                35,
                'request_transport_retry'
            )
        ) {
            $raw = @file_get_contents($url, false, $context);
        }
        if ($raw === false) {
            return ['ok' => false, 'status' => 503, 'error' => 'Semantic search service unavailable'];
        }
    }

    $statusCode = 200;
    foreach ($http_response_header ?? [] as $header) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $header, $matches)) {
            $statusCode = (int)$matches[1];
            break;
        }
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return ['ok' => false, 'status' => 502, 'error' => 'Semantic search service returned invalid JSON'];
    }

    $shouldRetry = $statusCode >= 500 || (($decoded['ok'] ?? true) === false);
    if (
        $shouldRetry
        && $searchHealthUrl && $searchHomeDir && $searchStartScript
        && $embedHealthUrl && $embedHomeDir && $embedStartScript
        && $stateFile && $logFile
        && ensureSemanticLane(
            $searchHealthUrl,
            $searchHomeDir,
            $searchStartScript,
            $embedHealthUrl,
            $embedHomeDir,
            $embedStartScript,
            $stateFile,
            $logFile,
            $cooldownSeconds,
            35,
            'request_http_retry'
        )
    ) {
        $raw = @file_get_contents($url, false, $context);
        if ($raw !== false) {
            $statusCode = 200;
            foreach ($http_response_header ?? [] as $header) {
                if (preg_match('#^HTTP/\S+\s+(\d{3})#', $header, $matches)) {
                    $statusCode = (int)$matches[1];
                    break;
                }
            }
            $decoded = json_decode($raw, true);
        }
    }

    if (!is_array($decoded)) {
        return ['ok' => false, 'status' => 502, 'error' => 'Semantic search service returned invalid JSON'];
    }

    return ['ok' => true, 'status' => $statusCode, 'body' => $decoded];
}
