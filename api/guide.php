<?php
declare(strict_types=1);

require_once __DIR__ . '/utils.php';
require_once __DIR__ . '/supervisor.php';
require_once __DIR__ . '/search.php';

function trimGuideText($value, int $maxLength = 240): string
{
    if (!is_string($value)) {
        return '';
    }
    $value = preg_replace('/\s+/u', ' ', trim($value));
    if (mb_strlen($value) <= $maxLength) {
        return $value;
    }
    return mb_substr($value, 0, $maxLength - 3) . '...';
}

function normalizeSemanticGuideResults($value): array
{
    if (!is_array($value)) {
        return [];
    }

    $results = [];
    foreach (array_slice($value, 0, 6) as $row) {
        if (!is_array($row)) {
            continue;
        }

        $leadId = (int)($row['lead_id'] ?? 0);
        $name = trimGuideText($row['name'] ?? '', 90);
        if ($leadId <= 0 || $name === '') {
            continue;
        }

        $results[] = [
            'lead_id' => $leadId,
            'name' => $name,
            'city' => trimGuideText($row['city'] ?? '', 48),
            'cluster_label' => trimGuideText($row['cluster_label'] ?? '', 64),
            'status' => trimGuideText($row['status'] ?? '', 32),
            'public_note' => trimGuideText($row['public_note'] ?? '', 180),
            'public_detail' => trimGuideText($row['public_detail'] ?? '', 220),
            'address' => trimGuideText($row['address'] ?? '', 120),
            'naics' => trimGuideText($row['naics'] ?? '', 48),
        ];
    }

    return $results;
}

function loadSemanticGuideCache(string $cacheFile, int $ttlSeconds): ?array
{
    if (!is_file($cacheFile)) {
        return null;
    }

    $ageSeconds = time() - (int)@filemtime($cacheFile);
    if ($ageSeconds < 0 || $ageSeconds > $ttlSeconds) {
        return null;
    }

    $raw = @file_get_contents($cacheFile);
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($decoded)) {
        return null;
    }

    $decoded['cached'] = true;
    $decoded['cache_age_seconds'] = $ageSeconds;
    return $decoded;
}

function waitForSemanticGuideCache(string $cacheFile, int $ttlSeconds, int $waitMs): ?array
{
    $deadline = microtime(true) + max(0, $waitMs) / 1000;
    do {
        $cached = loadSemanticGuideCache($cacheFile, $ttlSeconds);
        if (is_array($cached)) {
            return $cached;
        }
        usleep(120000);
    } while (microtime(true) < $deadline);

    return null;
}

function persistSemanticGuideCache(string $cacheFile, array $payload): void
{
    $dir = dirname($cacheFile);
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }

    $toStore = $payload;
    unset($toStore['cached'], $toStore['cache_age_seconds']);
    $json = json_encode($toStore, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PRETTY_PRINT);
    if ($json !== false) {
        @file_put_contents($cacheFile, $json, LOCK_EX);
    }
}

function semanticGuideCacheKey(array $normalizedRequest): string
{
    $encoded = json_encode($normalizedRequest, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    return hash('sha256', 'semantic-guide-v3|' . ($encoded ?: (string)($normalizedRequest['query'] ?? '')));
}

function semanticGuideCacheFile(string $cacheDir, string $cacheKey): string
{
    return rtrim($cacheDir, '/\\') . DIRECTORY_SEPARATOR . $cacheKey . '.json';
}

function semanticGuideLockFile(string $cacheDir, string $cacheKey): string
{
    return rtrim($cacheDir, '/\\') . DIRECTORY_SEPARATOR . $cacheKey . '.lock';
}

function semanticGuideJobFile(string $jobDir, string $cacheKey): string
{
    return rtrim($jobDir, '/\\') . DIRECTORY_SEPARATOR . $cacheKey . '.json';
}

function semanticGemmaCacheFile(string $cacheDir, string $cacheKey): string
{
    return rtrim($cacheDir, '/\\') . DIRECTORY_SEPARATOR . $cacheKey . '.json';
}

function buildSemanticGemmaTrailStoryPrompt(array $request): string
{
    $query = trimGuideText($request['query'] ?? '', 80);
    $view = trimGuideText($request['view'] ?? '', 16);
    $anchorName = trimGuideText($request['anchor_name'] ?? '', 90);
    $visibleMatches = (int)($request['visible_matches'] ?? 0);
    $results = is_array($request['results'] ?? null) ? $request['results'] : [];

    $lines = [
        'Write a concise cached background story for the semantic business demo.',
        'Use only the supplied visible records. Do not invent facts, trends, or private information.',
        'The story should feel like a field-guide note: useful, grounded, and calm.',
        'Length: 80 to 140 words. Plain text only. No markdown. No bullets.',
        '',
        'Trail context:',
        'Query: ' . ($query !== '' ? $query : '[none]'),
        'View: ' . ($view !== '' ? $view : 'galaxy'),
        'Visible matches: ' . $visibleMatches,
        'Anchor: ' . ($anchorName !== '' ? $anchorName : '[none]'),
        'Visible records:',
    ];

    foreach (array_slice($results, 0, 6) as $index => $row) {
        $parts = array_filter([
            $row['name'] ?? '',
            $row['cluster_label'] ?? '',
            $row['city'] ?? '',
            $row['status'] ?? '',
            $row['public_note'] ?? '',
            $row['public_detail'] ?? '',
        ], static fn($value): bool => is_string($value) && trim($value) !== '');
        $lines[] = sprintf('%d. %s', $index + 1, implode(' | ', $parts));
    }

    return implode("\n", $lines);
}

function buildSemanticGemmaTrailStoryJob(array $normalizedRequest): array
{
    $results = is_array($normalizedRequest['results'] ?? null) ? $normalizedRequest['results'] : [];
    $leadIds = [];
    foreach ($results as $row) {
        $leadId = (int)($row['lead_id'] ?? 0);
        if ($leadId > 0) {
            $leadIds[] = $leadId;
        }
    }

    return [
        'version' => 1,
        'kind' => 'semantic_trail_story_v1',
        'prompt' => buildSemanticGemmaTrailStoryPrompt($normalizedRequest),
        'max_tokens' => 180,
        'temperature' => 0.18,
        'enable_thinking' => false,
        'metadata' => [
            'schema_version' => 1,
            'query' => $normalizedRequest['query'] ?? '',
            'view' => $normalizedRequest['view'] ?? 'galaxy',
            'anchor_lead_id' => $normalizedRequest['anchor_lead_id'] ?? null,
            'anchor_name' => $normalizedRequest['anchor_name'] ?? '',
            'visible_matches' => $normalizedRequest['visible_matches'] ?? count($results),
            'lead_ids' => $leadIds,
        ],
    ];
}

function semanticGemmaTrailStoryCacheKey(array $normalizedRequest): string
{
    $job = buildSemanticGemmaTrailStoryJob($normalizedRequest);
    $encoded = json_encode([
        'kind' => $job['kind'],
        'prompt' => $job['prompt'],
        'messages' => null,
        'max_tokens' => $job['max_tokens'],
        'temperature' => $job['temperature'],
        'metadata' => $job['metadata'],
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    return hash('sha256', 'semantic-gemma-story-v1|' . ($encoded ?: (string)($normalizedRequest['query'] ?? '')));
}

function loadSemanticGemmaTrailStoryCache(string $cacheFile, int $ttlSeconds): ?array
{
    if (!is_file($cacheFile)) {
        return null;
    }

    $ageSeconds = time() - (int)@filemtime($cacheFile);
    if ($ageSeconds < 0 || $ageSeconds > $ttlSeconds) {
        return null;
    }

    $raw = @file_get_contents($cacheFile);
    $artifact = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($artifact)) {
        return null;
    }

    $story = trimGuideText($artifact['response'] ?? '', 900);
    if ($story === '') {
        return null;
    }

    return [
        'ok' => true,
        'mode' => 'cached_trail_story',
        'kind' => trimGuideText($artifact['kind'] ?? 'semantic_trail_story_v1', 80),
        'story' => $story,
        'source' => trimGuideText($artifact['source'] ?? 'semantic-guide-engine', 96),
        'cached' => true,
        'cache_age_seconds' => $ageSeconds,
        'degraded' => false,
        'reason' => 'cached_background_story',
        'artifact_created_at' => trimGuideText($artifact['created_at'] ?? '', 40),
        'timing' => is_array($artifact['timing'] ?? null) ? $artifact['timing'] : [],
        'metadata' => is_array($artifact['metadata'] ?? null) ? $artifact['metadata'] : [],
    ];
}

function enqueueSemanticGuideJob(string $jobDir, string $cacheDir, string $cacheKey, array $normalizedRequest): bool
{
    if (!is_dir($jobDir) && !@mkdir($jobDir, 0775, true) && !is_dir($jobDir)) {
        return false;
    }

    $jobFile = semanticGuideJobFile($jobDir, $cacheKey);
    if (is_file($jobFile)) {
        return true;
    }

    $payload = [
        'version' => 1,
        'cache_key' => $cacheKey,
        'request' => $normalizedRequest,
        'created_at' => gmdate('c'),
    ];
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PRETTY_PRINT);
    if ($json === false) {
        return false;
    }

    $tmpFile = $jobFile . '.tmp-' . getmypid() . '-' . bin2hex(random_bytes(4));
    if (@file_put_contents($tmpFile, $json . "\n", LOCK_EX) === false) {
        return false;
    }

    if (@rename($tmpFile, $jobFile)) {
        return true;
    }
    @unlink($tmpFile);
    return is_file($jobFile);
}

function buildSemanticGuideSuggestions(array $results, ?int $anchorLeadId): array
{
    $ordered = [];
    if ($anchorLeadId) {
        foreach ($results as $row) {
            if ((int)$row['lead_id'] === $anchorLeadId) {
                $ordered[] = $row;
                break;
            }
        }
    }

    foreach ($results as $row) {
        if ($anchorLeadId && (int)$row['lead_id'] === $anchorLeadId) {
            continue;
        }
        $ordered[] = $row;
    }

    $anchorCluster = null;
    $anchorCity = null;
    foreach ($results as $row) {
        if ($anchorLeadId && (int)$row['lead_id'] === $anchorLeadId) {
            $anchorCluster = $row['cluster_label'] ?: null;
            $anchorCity = $row['city'] ?: null;
            break;
        }
    }

    $labels = ['Trail anchor', 'Next stop', 'Side path'];
    $suggestions = [];
    foreach (array_slice($ordered, 0, 3) as $index => $row) {
        $reason = 'Strong semantic match in this trail.';
        if ($anchorLeadId && (int)$row['lead_id'] === $anchorLeadId) {
            $reason = 'Start here. This business is anchoring the current trail.';
        } elseif ($anchorCluster && $row['cluster_label'] === $anchorCluster && $row['cluster_label'] !== '') {
            $reason = 'Shared county theme with the current anchor.';
        } elseif ($anchorCity && $row['city'] === $anchorCity && $row['city'] !== '') {
            $reason = 'Same city pocket as the current anchor.';
        } elseif ($row['cluster_label'] !== '') {
            $reason = sprintf('A nearby semantic side path through %s.', $row['cluster_label']);
        }

        $suggestions[] = [
            'lead_id' => (int)$row['lead_id'],
            'label' => $labels[min($index, count($labels) - 1)],
            'name' => $row['name'],
            'city' => $row['city'],
            'reason' => trimGuideText($reason, 96),
        ];
    }

    return $suggestions;
}

function buildSemanticGuideFallback(array $request, array $suggestions, string $reason = 'fallback'): array
{
    $query = trimGuideText($request['query'] ?? '', 80);
    $results = is_array($request['results'] ?? null) ? $request['results'] : [];
    $visibleMatches = max((int)($request['visible_matches'] ?? count($results)), count($results));
    $anchorLeadId = isset($request['anchor_lead_id']) ? (int)$request['anchor_lead_id'] : 0;
    $anchorName = trimGuideText($request['anchor_name'] ?? '', 90);

    foreach ($results as $row) {
        if ($anchorLeadId > 0 && (int)($row['lead_id'] ?? 0) === $anchorLeadId) {
            $anchorName = trimGuideText($row['name'] ?? $anchorName, 90);
            break;
        }
    }

    $themes = [];
    $cities = [];
    foreach ($results as $row) {
        if (!empty($row['cluster_label']) && !in_array($row['cluster_label'], $themes, true)) {
            $themes[] = $row['cluster_label'];
        }
        if (!empty($row['city']) && !in_array($row['city'], $cities, true)) {
            $cities[] = $row['city'];
        }
    }

    $title = $anchorName !== ''
        ? trimGuideText($anchorName . ' anchors this trail', 64)
        : trimGuideText(($query !== '' ? '"' . $query . '" trail guide' : 'County trail guide'), 64);

    $parts = [];
    if ($query !== '') {
        $parts[] = sprintf('"%s" is surfacing %d visible county matches', $query, $visibleMatches);
    } elseif ($visibleMatches > 0) {
        $parts[] = sprintf('%d visible county matches are active in this trail', $visibleMatches);
    }
    if ($anchorName !== '') {
        $parts[] = sprintf('%s is the strongest anchor', $anchorName);
    }
    if ($themes) {
        $parts[] = 'The strongest overlap runs through ' . implode(' and ', array_slice($themes, 0, 2));
    }
    if ($cities) {
        $parts[] = 'Signals cluster around ' . implode(' and ', array_slice($cities, 0, 2));
    }

    $summary = trimGuideText(implode('. ', $parts) . '.', 320);
    if ($summary === '') {
        $summary = 'The current semantic trail is ready. Use the anchor and the next two stops below to keep walking while the guide lane catches up.';
    }

    return [
        'ok' => true,
        'title' => $title,
        'summary' => $summary,
        'suggestions' => $suggestions,
        'mode' => 'fallback',
        'source' => 'deterministic',
        'cached' => false,
        'cache_age_seconds' => null,
        'degraded' => true,
        'reason' => $reason,
    ];
}

function buildSemanticGuidePrompt(array $request): string
{
    $query = trimGuideText($request['query'] ?? '', 80);
    $view = trimGuideText($request['view'] ?? '', 16);
    $anchorName = trimGuideText($request['anchor_name'] ?? '', 90);
    $visibleMatches = (int)($request['visible_matches'] ?? 0);
    $results = is_array($request['results'] ?? null) ? $request['results'] : [];

    $lines = [
        'You are writing a short public-facing guide for a semantic business search demo.',
        'Use only the supplied context. Do not invent facts outside the listed search results.',
        'Return strict JSON with exactly two string keys: title and summary.',
        'Rules:',
        '- title: 4 to 9 words, max 60 characters, no markdown',
        '- summary: one plain-English paragraph, max 280 characters',
        '- mention the anchor business if one is supplied',
        '- describe the visible pattern in the current search results, not the whole county',
        '',
        'Context:',
        'Query: ' . ($query !== '' ? $query : '[none]'),
        'View: ' . ($view !== '' ? $view : 'galaxy'),
        'Visible matches: ' . $visibleMatches,
        'Anchor: ' . ($anchorName !== '' ? $anchorName : '[none]'),
        'Top results:',
    ];

    foreach (array_slice($results, 0, 6) as $index => $row) {
        $parts = array_filter([
            $row['name'] ?? '',
            $row['cluster_label'] ?? '',
            $row['city'] ?? '',
            $row['public_note'] ?? '',
        ], static fn($value): bool => is_string($value) && $value !== '');
        $lines[] = sprintf('%d. %s', $index + 1, implode(' | ', $parts));
    }

    return implode("\n", $lines);
}

function decodeSemanticGuideCandidate(string $raw, array $fallback): ?array
{
    $raw = trim($raw);
    if ($raw === '') {
        return null;
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded) && preg_match('/\{.*\}/s', $raw, $matches)) {
        $decoded = json_decode($matches[0], true);
    }

    $title = is_array($decoded) ? trimGuideText($decoded['title'] ?? '', 60) : '';
    $summary = is_array($decoded) ? trimGuideText($decoded['summary'] ?? '', 280) : '';

    if ($title === '' && $summary === '') {
        $summary = trimGuideText($raw, 280);
        $title = trimGuideText($fallback['title'] ?? 'Search', 60);
    }

    if ($title === '' || $summary === '') {
        return null;
    }

    return [
        'title' => $title,
        'summary' => $summary,
    ];
}

function semanticGuideSummaryNeedsGroundingRewrite(array $body, array $decodedGuide, array $results): bool
{
    $summary = strtolower($decodedGuide['summary'] ?? '');
    if ($summary === '') {
        return true;
    }

    foreach (['retrieved slice', 'retrieved records', 'strongest examples', "\n-", ' - '] as $marker) {
        if (str_contains($summary, $marker)) {
            return true;
        }
    }

    $allowedIds = [];
    foreach ($results as $row) {
        $allowedIds[(int)($row['lead_id'] ?? 0)] = true;
    }

    $retrievedItems = is_array($body['retrieved_items'] ?? null) ? $body['retrieved_items'] : [];
    foreach ($retrievedItems as $item) {
        if (!is_array($item)) {
            continue;
        }
        $leadId = (int)($item['lead_id'] ?? 0);
        $name = trimGuideText($item['name'] ?? '', 90);
        if ($leadId > 0 && !isset($allowedIds[$leadId]) && $name !== '' && str_contains($summary, strtolower($name))) {
            return true;
        }
    }

    return false;
}

function buildSemanticGuideLlmPayload(
    array $normalizedRequest,
    array $suggestions,
    array $fallbackPayload,
    string $askMocoHealthUrl,
    string $askMocoAskUrl,
    string $semanticServiceHome,
    string $askMocoStartScript,
    int $warmupSeconds = 90
): ?array {
    if (!ensureService($askMocoHealthUrl, $semanticServiceHome, $askMocoStartScript, $warmupSeconds)) {
        return null;
    }

    $llmResponse = postJson($askMocoAskUrl, [
        'prompt' => buildSemanticGuidePrompt($normalizedRequest),
        'max_new_tokens' => 96,
        'temperature' => 0.0,
        'allow_ungrounded_local' => false,
    ], 20);

    $body = is_array($llmResponse['body'] ?? null) ? $llmResponse['body'] : null;
    $decodedGuide = is_array($body) ? decodeSemanticGuideCandidate((string)($body['response'] ?? ''), $fallbackPayload) : null;
    if (!$llmResponse['ok'] || !$body || (($body['ok'] ?? true) === false) || !is_array($decodedGuide)) {
        return null;
    }

    $results = is_array($normalizedRequest['results'] ?? null) ? $normalizedRequest['results'] : [];
    $summaryWasGrounded = !semanticGuideSummaryNeedsGroundingRewrite($body, $decodedGuide, $results);
    return [
        'ok' => true,
        'title' => $fallbackPayload['title'],
        'summary' => $summaryWasGrounded ? $decodedGuide['summary'] : $fallbackPayload['summary'],
        'suggestions' => $suggestions,
        'mode' => 'llm',
        'source' => trimGuideText($body['model'] ?? 'semantic-guide-engine', 64),
        'cached' => false,
        'cache_age_seconds' => null,
        'degraded' => false,
        'reason' => $summaryWasGrounded ? 'background_generation' : 'background_generation_grounded_rewrite',
        'timing' => [
            'total_seconds' => isset($body['total_seconds']) ? (float)$body['total_seconds'] : null,
            'generate_seconds' => isset($body['generate_seconds']) ? (float)$body['generate_seconds'] : null,
        ],
    ];
}

function processSemanticGuideJob(
    string $jobFile,
    string $cacheDir,
    string $askMocoHealthUrl,
    string $askMocoAskUrl,
    string $semanticServiceHome,
    string $askMocoStartScript
): array {
    if (!is_file($jobFile)) {
        return ['ok' => true, 'status' => 'missing'];
    }

    $raw = @file_get_contents($jobFile);
    $job = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($job) || !is_array($job['request'] ?? null)) {
        @rename($jobFile, $jobFile . '.bad-' . time());
        return ['ok' => false, 'status' => 'bad_job'];
    }

    $cacheKey = trimGuideText($job['cache_key'] ?? '', 96);
    $normalizedRequest = $job['request'];
    if ($cacheKey === '') {
        $cacheKey = semanticGuideCacheKey($normalizedRequest);
    }

    $cacheFile = semanticGuideCacheFile($cacheDir, $cacheKey);
    $suggestions = buildSemanticGuideSuggestions(
        is_array($normalizedRequest['results'] ?? null) ? $normalizedRequest['results'] : [],
        isset($normalizedRequest['anchor_lead_id']) ? (int)$normalizedRequest['anchor_lead_id'] : null
    );
    $fallbackPayload = buildSemanticGuideFallback($normalizedRequest, $suggestions, 'worker_fallback');
    $payload = buildSemanticGuideLlmPayload(
        $normalizedRequest,
        $suggestions,
        $fallbackPayload,
        $askMocoHealthUrl,
        $askMocoAskUrl,
        $semanticServiceHome,
        $askMocoStartScript,
        90
    );

    if (!is_array($payload)) {
        @touch($jobFile);
        return ['ok' => false, 'status' => 'llm_unavailable', 'cache_key' => $cacheKey];
    }

    persistSemanticGuideCache($cacheFile, $payload);
    @unlink($jobFile);
    return ['ok' => true, 'status' => 'cached', 'cache_key' => $cacheKey, 'mode' => $payload['mode'] ?? null];
}
