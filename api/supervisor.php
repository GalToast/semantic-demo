<?php
declare(strict_types=1);

function serviceHealthy(string $url, int $timeoutSeconds = 2): bool
{
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => "Connection: close\r\n",
            'timeout' => $timeoutSeconds,
            'ignore_errors' => true,
        ],
    ]);

    $raw = @file_get_contents($url, false, $context);
    if ($raw === false) {
        return false;
    }

    foreach ($http_response_header ?? [] as $header) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $header, $matches) && (int)$matches[1] >= 400) {
            return false;
        }
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) && ($decoded['ok'] ?? false) === true;
}

function fetchServiceHealthSnapshot(string $url, int $timeoutSeconds = 2): array
{
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => "Connection: close\r\n",
            'timeout' => $timeoutSeconds,
            'ignore_errors' => true,
        ],
    ]);

    $raw = @file_get_contents($url, false, $context);
    $statusCode = 0;
    foreach ($http_response_header ?? [] as $header) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $header, $matches)) {
            $statusCode = (int)$matches[1];
            break;
        }
    }

    if ($raw === false) {
        return [
            'ok' => false,
            'status_code' => $statusCode,
            'body' => null,
            'error' => 'connection_failed',
        ];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return [
            'ok' => false,
            'status_code' => $statusCode,
            'body' => null,
            'error' => 'invalid_json',
        ];
    }

    return [
        'ok' => $statusCode < 400 && (($decoded['ok'] ?? false) === true),
        'status_code' => $statusCode,
        'body' => $decoded,
        'error' => null,
    ];
}

function readServiceRuntimeState(string $stateFile): ?array
{
    if (!is_file($stateFile)) {
        return null;
    }

    $raw = @file_get_contents($stateFile);
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    return is_array($decoded) ? $decoded : null;
}

function normalizeOptionalInt($value): ?int
{
    if (is_int($value) && $value > 0) {
        return $value;
    }
    if (is_string($value) && preg_match('/^\d+$/', trim($value))) {
        $parsed = (int)trim($value);
        return $parsed > 0 ? $parsed : null;
    }
    return null;
}

function summarizeServiceSnapshot(array $snapshot, string $stateFile): array
{
    $runtimeState = readServiceRuntimeState($stateFile) ?? [];
    $body = is_array($snapshot['body'] ?? null) ? $snapshot['body'] : [];
    $bodyRuntime = is_array($body['runtime'] ?? null) ? $body['runtime'] : [];

    return [
        'ok' => (bool)($snapshot['ok'] ?? false),
        'status_code' => (int)($snapshot['status_code'] ?? 0),
        'error' => $snapshot['error'] ?? null,
        'worker_answered_health' => (bool)($snapshot['ok'] ?? false),
        'service' => $body['service'] ?? ($runtimeState['service'] ?? null),
        'supervisor_pid' => normalizeOptionalInt($bodyRuntime['supervisor_pid'] ?? ($runtimeState['supervisor_pid'] ?? null)),
        'process_group_id' => normalizeOptionalInt($bodyRuntime['process_group_id'] ?? ($runtimeState['process_group_id'] ?? null)),
        'worker_pid' => normalizeOptionalInt($bodyRuntime['worker_pid'] ?? ($runtimeState['worker_pid'] ?? null)),
        'worker_parent_pid' => normalizeOptionalInt($bodyRuntime['worker_parent_pid'] ?? ($runtimeState['worker_parent_pid'] ?? null)),
        'supervisor_started_at' => $bodyRuntime['supervisor_started_at'] ?? ($runtimeState['supervisor_started_at'] ?? null),
        'worker_started_at' => $bodyRuntime['worker_started_at'] ?? ($runtimeState['worker_started_at'] ?? null),
        'state_file' => $bodyRuntime['state_file'] ?? ($runtimeState['state_file'] ?? $stateFile),
        'state_updated_at' => $runtimeState['updated_at'] ?? null,
    ];
}

function loadSemanticLaneState(string $stateFile): array
{
    if (!is_file($stateFile)) {
        return ['services' => [], 'lane' => []];
    }

    $raw = @file_get_contents($stateFile);
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    return is_array($decoded) ? $decoded : ['services' => [], 'lane' => []];
}

function saveSemanticLaneState(string $stateFile, array $state): void
{
    $dir = dirname($stateFile);
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    $json = json_encode($state, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PRETTY_PRINT);
    if ($json !== false) {
        @file_put_contents($stateFile, $json, LOCK_EX);
    }
}

function logSemanticLaneEvent(string $logFile, string $eventType, array $context = []): void
{
    $dir = dirname($logFile);
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }

    $entry = [
        'time' => gmdate('c'),
        'event' => $eventType,
        'context' => $context,
    ];
    $json = json_encode($entry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($json !== false) {
        @file_put_contents($logFile, $json . PHP_EOL, FILE_APPEND | LOCK_EX);
    }
}

function parseLogTimestamp(?string $value): ?int
{
    if (!is_string($value) || trim($value) === '') {
        return null;
    }
    $timestamp = strtotime($value);
    return $timestamp === false ? null : $timestamp;
}

function readRecentJsonLines(string $path, int $limit = 120): array
{
    if (!is_file($path)) {
        return [];
    }

    $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines) || !$lines) {
        return [];
    }

    $rows = [];
    foreach (array_slice($lines, -$limit) as $line) {
        $decoded = json_decode((string)$line, true);
        if (is_array($decoded)) {
            $rows[] = $decoded;
        }
    }
    return $rows;
}

function summarizeSemanticLaneEventEntry(array $entry): array
{
    $event = (string)($entry['event'] ?? 'unknown');
    $context = is_array($entry['context'] ?? null) ? $entry['context'] : [];
    $service = (string)($context['service'] ?? ($event === 'lane_degraded' || $event === 'lane_recovered' ? 'lane' : ''));
    $label = ucwords(str_replace('_', ' ', $event));
    $detail = '';

    if ($event === 'restart_triggered') {
        $serviceLabel = $service === 'embed' ? 'Embed' : ($service === 'search' ? 'Search' : 'Lane');
        $label = $serviceLabel . ' restart triggered';
        $detail = 'Reason: ' . (string)($context['reason'] ?? 'unknown');
    } elseif ($event === 'restart_cooldown') {
        $serviceLabel = $service === 'embed' ? 'Embed' : ($service === 'search' ? 'Search' : 'Lane');
        $label = $serviceLabel . ' restart cooling down';
        $detail = 'Cooldown: ' . (int)($context['cooldown_remaining_seconds'] ?? 0) . 's remaining';
    } elseif ($event === 'service_unhealthy') {
        $serviceLabel = $service === 'embed' ? 'Embed' : ($service === 'search' ? 'Search' : 'Service');
        $label = $serviceLabel . ' unhealthy';
        $detail = 'Health check failed.';
    } elseif ($event === 'service_recovered') {
        $serviceLabel = $service === 'embed' ? 'Embed' : ($service === 'search' ? 'Search' : 'Service');
        $label = $serviceLabel . ' recovered';
        $downtime = isset($context['downtime_seconds']) ? (int)$context['downtime_seconds'] : null;
        $detail = $downtime !== null ? 'Downtime: ' . $downtime . 's' : 'Recovered.';
    } elseif ($event === 'lane_degraded') {
        $label = 'Lane degraded';
        $detail = 'Search ' . (((bool)($context['search_ok'] ?? false)) ? 'up' : 'down') . ' • Embed ' . (((bool)($context['embed_ok'] ?? false)) ? 'up' : 'down');
    } elseif ($event === 'lane_recovered') {
        $label = 'Lane recovered';
        $downtime = isset($context['downtime_seconds']) ? (int)$context['downtime_seconds'] : null;
        $detail = $downtime !== null ? 'Downtime: ' . $downtime . 's' : 'Recovered.';
    } else {
        $detail = json_encode($context, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) ?: '';
    }

    return [
        'time' => $entry['time'] ?? null,
        'timestamp' => parseLogTimestamp($entry['time'] ?? null),
        'event' => $event,
        'service' => $service !== '' ? $service : null,
        'label' => $label,
        'detail' => $detail,
    ];
}

function summarizeSemanticLaneWatchdogEntry(array $entry): array
{
    $searchAction = (string)($entry['search_action'] ?? 'no_restart');
    $embedAction = (string)($entry['embed_action'] ?? 'no_restart');
    $actionLabel = 'No restart';
    if ($searchAction === 'restart_triggered' || $embedAction === 'restart_triggered') {
        $actionLabel = trim(
            ($searchAction === 'restart_triggered' ? 'search ' : '')
            . ($embedAction === 'restart_triggered' ? 'embed ' : '')
            . 'restart'
        );
    } elseif ($searchAction === 'restart_cooldown' || $embedAction === 'restart_cooldown') {
        $actionLabel = trim(
            ($searchAction === 'restart_cooldown' ? 'search ' : '')
            . ($embedAction === 'restart_cooldown' ? 'embed ' : '')
            . 'cooldown'
        );
    }

    return [
        'time' => $entry['time'] ?? null,
        'timestamp' => parseLogTimestamp($entry['time'] ?? null),
        'ok' => (bool)($entry['ok'] ?? false),
        'route' => $entry['route'] ?? null,
        'state' => $entry['state'] ?? null,
        'attempted_warm' => (bool)($entry['attempted_warm'] ?? false),
        'provenance' => $entry['provenance'] ?? null,
        'action_label' => $actionLabel,
        'error' => $entry['error'] ?? null,
    ];
}

function getSemanticLaneOpsSummary(
    string $stateFile,
    string $eventLog,
    string $watchdogLog
): array {
    $state = loadSemanticLaneState($stateFile);
    $eventEntries = readRecentJsonLines($eventLog, 220);
    $watchdogEntries = readRecentJsonLines($watchdogLog, 160);
    $now = time();
    $since24h = $now - 86400;

    $recentEvents = [];
    $eventCounts24h = [
        'lane_degraded' => 0,
        'lane_recovered' => 0,
        'restart_triggered' => 0,
        'restart_cooldown' => 0,
        'service_unhealthy' => 0,
        'service_recovered' => 0,
    ];
    foreach ($eventEntries as $entry) {
        $summary = summarizeSemanticLaneEventEntry($entry);
        $timestamp = $summary['timestamp'];
        if ($timestamp !== null && $timestamp >= $since24h && array_key_exists($summary['event'], $eventCounts24h)) {
            $eventCounts24h[$summary['event']] += 1;
        }
        $recentEvents[] = $summary;
    }
    $recentEvents = array_slice(array_reverse($recentEvents), 0, 6);

    $recentWatchdogRuns = [];
    $watchdogCounts24h = [
        'runs' => 0,
        'failures' => 0,
        'attempted_warm' => 0,
    ];
    foreach ($watchdogEntries as $entry) {
        $summary = summarizeSemanticLaneWatchdogEntry($entry);
        $timestamp = $summary['timestamp'];
        if ($timestamp !== null && $timestamp >= $since24h) {
            $watchdogCounts24h['runs'] += 1;
            if (!$summary['ok']) {
                $watchdogCounts24h['failures'] += 1;
            }
            if ($summary['attempted_warm']) {
                $watchdogCounts24h['attempted_warm'] += 1;
            }
        }
        $recentWatchdogRuns[] = $summary;
    }
    $recentWatchdogRuns = array_slice(array_reverse($recentWatchdogRuns), 0, 4);
    $lastWatchdogRun = $recentWatchdogRuns[0] ?? null;

    return [
        'ok' => true,
        'checked_at' => gmdate('c'),
        'counts' => [
            'restart_totals' => [
                'search' => (int)($state['services']['search']['restart_count'] ?? 0),
                'embed' => (int)($state['services']['embed']['restart_count'] ?? 0),
            ],
            'events_24h' => $eventCounts24h,
            'watchdog_24h' => $watchdogCounts24h,
        ],
        'services' => [
            'search' => [
                'healthy' => (bool)($state['services']['search']['healthy'] ?? false),
                'last_failure_at' => isset($state['services']['search']['last_failure_at']) ? gmdate('c', (int)$state['services']['search']['last_failure_at']) : null,
                'last_recovered_at' => isset($state['services']['search']['last_recovered_at']) ? gmdate('c', (int)$state['services']['search']['last_recovered_at']) : null,
                'last_restart_at' => isset($state['services']['search']['last_restart_at']) ? gmdate('c', (int)$state['services']['search']['last_restart_at']) : null,
                'last_restart_reason' => $state['services']['search']['last_restart_reason'] ?? null,
            ],
            'embed' => [
                'healthy' => (bool)($state['services']['embed']['healthy'] ?? false),
                'last_failure_at' => isset($state['services']['embed']['last_failure_at']) ? gmdate('c', (int)$state['services']['embed']['last_failure_at']) : null,
                'last_recovered_at' => isset($state['services']['embed']['last_recovered_at']) ? gmdate('c', (int)$state['services']['embed']['last_recovered_at']) : null,
                'last_restart_at' => isset($state['services']['embed']['last_restart_at']) ? gmdate('c', (int)$state['services']['embed']['last_restart_at']) : null,
                'last_restart_reason' => $state['services']['embed']['last_restart_reason'] ?? null,
            ],
            'lane' => [
                'healthy' => (bool)($state['lane']['healthy'] ?? false),
                'last_failure_at' => isset($state['lane']['last_failure_at']) ? gmdate('c', (int)$state['lane']['last_failure_at']) : null,
                'last_recovered_at' => isset($state['lane']['last_recovered_at']) ? gmdate('c', (int)$state['lane']['last_recovered_at']) : null,
            ],
        ],
        'last_watchdog_run' => $lastWatchdogRun,
        'recent_watchdog_runs' => $recentWatchdogRuns,
        'recent_events' => $recentEvents,
    ];
}

function describeRestartAction(array $action): string
{
    if (($action['triggered'] ?? false) === true) {
        return 'restart_triggered';
    }
    if (($action['cooldown_active'] ?? false) === true) {
        return 'restart_cooldown';
    }
    return 'no_restart';
}

function triggerServiceRestartWithCooldown(
    string $serviceKey,
    string $homeDir,
    string $startScript,
    string $stateFile,
    string $logFile,
    string $reason,
    int $cooldownSeconds = 45
): array {
    $state = loadSemanticLaneState($stateFile);
    $serviceState = $state['services'][$serviceKey] ?? [];
    $now = time();
    $lastRestartAt = (int)($serviceState['last_restart_at'] ?? 0);
    $cooldownRemaining = max(0, ($lastRestartAt + $cooldownSeconds) - $now);

    if ($lastRestartAt > 0 && $cooldownRemaining > 0) {
        $lastCooldownLogAt = (int)($serviceState['last_cooldown_log_at'] ?? 0);
        if (($now - $lastCooldownLogAt) >= 10) {
            logSemanticLaneEvent($logFile, 'restart_cooldown', [
                'service' => $serviceKey,
                'reason' => $reason,
                'cooldown_remaining_seconds' => $cooldownRemaining,
            ]);
            $serviceState['last_cooldown_log_at'] = $now;
            $state['services'][$serviceKey] = $serviceState;
            saveSemanticLaneState($stateFile, $state);
        }

        return [
            'triggered' => false,
            'cooldown_active' => true,
            'cooldown_remaining_seconds' => $cooldownRemaining,
            'reason' => $reason,
            'triggered_at' => null,
        ];
    }

    kickService($homeDir, $startScript);
    $serviceState['last_restart_at'] = $now;
    $serviceState['last_restart_reason'] = $reason;
    $serviceState['last_restart_logged_at'] = $now;
    $serviceState['restart_count'] = (int)($serviceState['restart_count'] ?? 0) + 1;
    $state['services'][$serviceKey] = $serviceState;
    saveSemanticLaneState($stateFile, $state);

    logSemanticLaneEvent($logFile, 'restart_triggered', [
        'service' => $serviceKey,
        'reason' => $reason,
        'cooldown_seconds' => $cooldownSeconds,
    ]);

    return [
        'triggered' => true,
        'cooldown_active' => false,
        'cooldown_remaining_seconds' => 0,
        'reason' => $reason,
        'triggered_at' => gmdate('c', $now),
    ];
}

function updateSemanticLaneState(
    string $stateFile,
    string $logFile,
    bool $searchHealthy,
    bool $embedHealthy
): array {
    $state = loadSemanticLaneState($stateFile);
    $now = time();

    foreach (['search' => $searchHealthy, 'embed' => $embedHealthy] as $serviceKey => $healthy) {
        $serviceState = $state['services'][$serviceKey] ?? [];
        $previous = array_key_exists('healthy', $serviceState) ? (bool)$serviceState['healthy'] : null;
        $serviceState['healthy'] = $healthy;
        $serviceState['last_checked_at'] = $now;

        if ($healthy) {
            if ($previous === false) {
                $serviceState['last_recovered_at'] = $now;
                $downtimeSeconds = isset($serviceState['last_failure_at']) ? max(0, $now - (int)$serviceState['last_failure_at']) : null;
                logSemanticLaneEvent($logFile, 'service_recovered', [
                    'service' => $serviceKey,
                    'downtime_seconds' => $downtimeSeconds,
                    'last_restart_reason' => $serviceState['last_restart_reason'] ?? null,
                ]);
            }
        } else {
            if ($previous !== false) {
                $serviceState['last_failure_at'] = $now;
                logSemanticLaneEvent($logFile, 'service_unhealthy', [
                    'service' => $serviceKey,
                ]);
            }
        }

        $state['services'][$serviceKey] = $serviceState;
    }

    $laneHealthy = $searchHealthy && $embedHealthy;
    $laneState = $state['lane'] ?? [];
    $previousLaneHealthy = array_key_exists('healthy', $laneState) ? (bool)$laneState['healthy'] : null;
    $laneState['healthy'] = $laneHealthy;
    $laneState['last_checked_at'] = $now;

    if ($laneHealthy) {
        if ($previousLaneHealthy === false) {
            $laneState['last_recovered_at'] = $now;
            $downtimeSeconds = isset($laneState['last_failure_at']) ? max(0, $now - (int)$laneState['last_failure_at']) : null;
            logSemanticLaneEvent($logFile, 'lane_recovered', [
                'downtime_seconds' => $downtimeSeconds,
            ]);
        }
    } else {
        if ($previousLaneHealthy !== false) {
            $laneState['last_failure_at'] = $now;
            logSemanticLaneEvent($logFile, 'lane_degraded', [
                'search_ok' => $searchHealthy,
                'embed_ok' => $embedHealthy,
            ]);
        }
    }

    $state['lane'] = $laneState;
    saveSemanticLaneState($stateFile, $state);
    return $state;
}

function formatAgeLabel(int $seconds): string
{
    if ($seconds < 2) {
        return 'just now';
    }
    if ($seconds < 60) {
        return $seconds . 's ago';
    }
    if ($seconds < 3600) {
        return round($seconds / 60) . 'm ago';
    }
    return round($seconds / 3600) . 'h ago';
}

function buildSemanticLaneProvenance(
    array $state,
    bool $searchHealthy,
    bool $embedHealthy,
    array $actions,
    int $recoveryFreshSeconds = 90
): array {
    $now = time();
    $laneState = $state['lane'] ?? [];
    $searchState = $state['services']['search'] ?? [];
    $embedState = $state['services']['embed'] ?? [];

    if ($searchHealthy && $embedHealthy) {
        $recoveredAt = isset($laneState['last_recovered_at']) ? (int)$laneState['last_recovered_at'] : 0;
        if ($recoveredAt > 0) {
            $age = max(0, $now - $recoveredAt);
            if ($age <= $recoveryFreshSeconds) {
                return [
                    'label' => 'Recovered ' . formatAgeLabel($age),
                    'detail' => 'Semantic lane recovered ' . formatAgeLabel($age) . '.',
                    'recovered_ago_seconds' => $age,
                    'service' => 'lane',
                ];
            }
        }

        return [
            'label' => 'Ready',
            'detail' => 'Search is ready.',
            'recovered_ago_seconds' => null,
            'service' => 'lane',
        ];
    }

    $downServices = [];
    if (!$searchHealthy) {
        $downServices[] = 'search';
    }
    if (!$embedHealthy) {
        $downServices[] = 'embed';
    }

    $primaryService = count($downServices) === 1 ? $downServices[0] : 'lane';
    $serviceLabel = $primaryService === 'embed'
        ? 'Embed'
        : ($primaryService === 'search' ? 'Search' : 'Search + embed');
    $primaryAction = count($downServices) === 1 ? ($actions[$primaryService] ?? []) : [];
    $anyRestartTriggered = (($actions['search']['triggered'] ?? false) === true) || (($actions['embed']['triggered'] ?? false) === true);
    $anyCooldownActive = (($actions['search']['cooldown_active'] ?? false) === true) || (($actions['embed']['cooldown_active'] ?? false) === true);

    $label = $serviceLabel . ' reconnecting';
    if (($primaryAction['triggered'] ?? false) === true || ($primaryService === 'lane' && $anyRestartTriggered)) {
        $label = $serviceLabel . ' restarting';
    }

    $detailParts = [];
    if (count($downServices) === 2) {
        $detailParts[] = 'The semantic engine is currently being optimized. Check back in a moment.';
    } elseif ($primaryService === 'embed') {
        $detailParts[] = 'The connection engine is updating. Check back in a moment.';
    } else {
        $detailParts[] = 'The search engine is updating. Check back in a moment.';
    }

    if (($primaryAction['triggered'] ?? false) === true) {
        $detailParts[] = 'Restart triggered just now.';
    } elseif (($primaryAction['cooldown_active'] ?? false) === true || ($primaryService === 'lane' && $anyCooldownActive)) {
        $cooldownRemaining = $primaryService === 'lane'
            ? max((int)($actions['search']['cooldown_remaining_seconds'] ?? 0), (int)($actions['embed']['cooldown_remaining_seconds'] ?? 0))
            : max(1, (int)$primaryAction['cooldown_remaining_seconds']);
        $detailParts[] = 'Restart cooling down for ' . max(1, $cooldownRemaining) . 's.';
    }

    $failureAt = 0;
    if ($primaryService === 'embed') {
        $failureAt = (int)($embedState['last_failure_at'] ?? 0);
    } elseif ($primaryService === 'search') {
        $failureAt = (int)($searchState['last_failure_at'] ?? 0);
    } else {
        $failureAt = max((int)($searchState['last_failure_at'] ?? 0), (int)($embedState['last_failure_at'] ?? 0));
    }
    if ($failureAt > 0) {
        $detailParts[] = 'First seen unhealthy ' . formatAgeLabel(max(0, $now - $failureAt)) . '.';
    }

    return [
        'label' => $label,
        'detail' => implode(' ', $detailParts),
        'recovered_ago_seconds' => null,
        'service' => $primaryService,
    ];
}

function kickService(string $homeDir, string $startScript): void
{
    if (!is_file($startScript) || !is_executable($startScript)) {
        return;
    }

    if (function_exists('proc_open')) {
        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['file', '/dev/null', 'a'],
            2 => ['file', '/dev/null', 'a'],
        ];
        $process = @proc_open(
            ['/bin/bash', '-lc', 'nohup "$0" >/dev/null 2>&1 &', $startScript],
            $descriptors,
            $pipes,
            null,
            ['HOME' => $homeDir]
        );
        if (is_resource($process)) {
            foreach ($pipes as $pipe) {
                if (is_resource($pipe)) {
                    @fclose($pipe);
                }
            }
            @proc_close($process);
            return;
        }
    }

    if (function_exists('exec')) {
        $cmd = sprintf(
            'HOME=%s %s >/dev/null 2>&1 &',
            escapeshellarg($homeDir),
            escapeshellarg($startScript)
        );
        @exec($cmd);
    }
}

function ensureService(string $healthUrl, string $homeDir, string $startScript, int $warmupSeconds = 20): bool
{
    if (serviceHealthy($healthUrl, 2)) {
        return true;
    }

    kickService($homeDir, $startScript);
    $deadline = microtime(true) + max(2, $warmupSeconds);
    while (microtime(true) < $deadline) {
        usleep(500000);
        if (serviceHealthy($healthUrl, 2)) {
            return true;
        }
    }

    return false;
}

function ensureSemanticLane(
    string $searchHealthUrl,
    string $searchHomeDir,
    string $searchStartScript,
    string $embedHealthUrl,
    string $embedHomeDir,
    string $embedStartScript,
    string $stateFile,
    string $logFile,
    int $cooldownSeconds = 45,
    int $warmupSeconds = 25,
    string $reason = 'request_preflight'
): bool {
    $searchHealthy = serviceHealthy($searchHealthUrl, 2);
    $embedHealthy = serviceHealthy($embedHealthUrl, 2);
    updateSemanticLaneState($stateFile, $logFile, $searchHealthy, $embedHealthy);

    if ($searchHealthy && $embedHealthy) {
        return true;
    }

    if (!$embedHealthy) {
        triggerServiceRestartWithCooldown(
            'embed',
            $embedHomeDir,
            $embedStartScript,
            $stateFile,
            $logFile,
            $reason,
            $cooldownSeconds
        );
    }
    if (!$searchHealthy) {
        triggerServiceRestartWithCooldown(
            'search',
            $searchHomeDir,
            $searchStartScript,
            $stateFile,
            $logFile,
            $reason,
            $cooldownSeconds
        );
    }

    $deadline = microtime(true) + max(3, $warmupSeconds);
    while (microtime(true) < $deadline) {
        usleep(500000);
        $searchHealthy = serviceHealthy($searchHealthUrl, 2);
        $embedHealthy = serviceHealthy($embedHealthUrl, 2);
        updateSemanticLaneState($stateFile, $logFile, $searchHealthy, $embedHealthy);
        if ($searchHealthy && $embedHealthy) {
            return true;
        }
    }

    return false;
}

function getSemanticLaneSnapshot(
    string $searchHealthUrl,
    string $searchHomeDir,
    string $searchStartScript,
    string $searchStateFile,
    string $embedHealthUrl,
    string $embedHomeDir,
    string $embedStartScript,
    string $embedStateFile,
    string $stateFile,
    string $logFile,
    int $cooldownSeconds = 45,
    int $recoveryFreshSeconds = 90,
    bool $warm = false,
    int $warmupSeconds = 8
): array {
    global $isDevMode;

    if ($isDevMode) {
        return [
            'ok' => true,
            'state' => 'healthy',
            'search_ok' => true,
            'embed_ok' => true,
            'attempted_warm' => false,
            'kicked' => ['search' => false, 'embed' => false],
            'actions' => [
                'search' => ['status' => 'No restart', 'cooldown_remaining_seconds' => 0, 'triggered_at' => null],
                'embed' => ['status' => 'No restart', 'cooldown_remaining_seconds' => 0, 'triggered_at' => null],
            ],
            'provenance' => [
                'state_source' => 'local-mock',
                'health_check_ms' => 1,
                'last_search_healthy' => true,
                'last_embed_healthy' => true,
                'recovery_active' => false,
            ]
        ];
    }

    $startedAt = microtime(true);
    $searchSnapshot = fetchServiceHealthSnapshot($searchHealthUrl, 2);
    $embedSnapshot = fetchServiceHealthSnapshot($embedHealthUrl, 2);
    $searchHealthy = (bool)($searchSnapshot['ok'] ?? false);
    $embedHealthy = (bool)($embedSnapshot['ok'] ?? false);
    $actions = [
        'search' => [
            'triggered' => false,
            'cooldown_active' => false,
            'cooldown_remaining_seconds' => 0,
            'reason' => null,
            'triggered_at' => null,
        ],
        'embed' => [
            'triggered' => false,
            'cooldown_active' => false,
            'cooldown_remaining_seconds' => 0,
            'reason' => null,
            'triggered_at' => null,
        ],
    ];

    if ($warm && (!$searchHealthy || !$embedHealthy)) {
        if (!$embedHealthy) {
            $actions['embed'] = triggerServiceRestartWithCooldown(
                'embed',
                $embedHomeDir,
                $embedStartScript,
                $stateFile,
                $logFile,
                'health_probe_warm',
                $cooldownSeconds
            );
        }
        if (!$searchHealthy) {
            $actions['search'] = triggerServiceRestartWithCooldown(
                'search',
                $searchHomeDir,
                $searchStartScript,
                $stateFile,
                $logFile,
                'health_probe_warm',
                $cooldownSeconds
            );
        }

        $deadline = microtime(true) + max(0, $warmupSeconds);
        while (microtime(true) < $deadline) {
            usleep(500000);
            $searchSnapshot = fetchServiceHealthSnapshot($searchHealthUrl, 2);
            $embedSnapshot = fetchServiceHealthSnapshot($embedHealthUrl, 2);
            $searchHealthy = (bool)($searchSnapshot['ok'] ?? false);
            $embedHealthy = (bool)($embedSnapshot['ok'] ?? false);
            if ($searchHealthy && $embedHealthy) {
                break;
            }
        }
    }

    $state = updateSemanticLaneState($stateFile, $logFile, $searchHealthy, $embedHealthy);
    $laneHealthy = $searchHealthy && $embedHealthy;
    $anyAction = ($actions['search']['triggered'] ?? false)
        || ($actions['embed']['triggered'] ?? false)
        || ($actions['search']['cooldown_active'] ?? false)
        || ($actions['embed']['cooldown_active'] ?? false);
    $laneState = $laneHealthy ? 'healthy' : ($anyAction ? 'reconnecting' : 'degraded');
    $provenance = buildSemanticLaneProvenance(
        $state,
        $searchHealthy,
        $embedHealthy,
        $actions,
        $recoveryFreshSeconds
    );
    $healthCheckMs = max(1, (int)round((microtime(true) - $startedAt) * 1000));

    return [
        'ok' => true,
        'state' => $laneState,
        'checked_at' => gmdate('c'),
        'search_ok' => $searchHealthy,
        'embed_ok' => $embedHealthy,
        'attempted_warm' => $warm,
        'kicked' => [
            'search' => (bool)($actions['search']['triggered'] ?? false),
            'embed' => (bool)($actions['embed']['triggered'] ?? false),
        ],
        'actions' => [
            'search' => [
                'status' => describeRestartAction($actions['search']),
                'cooldown_remaining_seconds' => (int)($actions['search']['cooldown_remaining_seconds'] ?? 0),
                'triggered_at' => $actions['search']['triggered_at'] ?? null,
                'reason' => $actions['search']['reason'] ?? null,
            ],
            'embed' => [
                'status' => describeRestartAction($actions['embed']),
                'cooldown_remaining_seconds' => (int)($actions['embed']['cooldown_remaining_seconds'] ?? 0),
                'triggered_at' => $actions['embed']['triggered_at'] ?? null,
                'reason' => $actions['embed']['reason'] ?? null,
            ],
        ],
        'provenance' => [
            ...$provenance,
            'state_source' => 'live-health-probe',
            'health_check_ms' => $healthCheckMs,
            'last_search_healthy' => $searchHealthy,
            'last_embed_healthy' => $embedHealthy,
            'recovery_active' => !$laneHealthy,
        ],
        'services' => [
            'search' => summarizeServiceSnapshot($searchSnapshot, $searchStateFile),
            'embed' => summarizeServiceSnapshot($embedSnapshot, $embedStateFile),
        ],
    ];
}