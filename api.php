<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/api/config.php';
require_once __DIR__ . '/api/utils.php';

function trimGuideText($value, int $maxLength = 240): string
{
    if (!is_string($value)) {
        return '';
    }
    $text = preg_replace('/\s+/u', ' ', trim($value));
    if (!is_string($text) || $text === '') {
        return '';
    }
    if (mb_strlen($text) <= $maxLength) {
        return $text;
    }
    return rtrim(mb_substr($text, 0, max(1, $maxLength - 1))) . '…';
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

function normalizeSemanticSearchQuery(string $query): string
{
    $query = preg_replace('/\s+/u', ' ', trim($query));
    if (!is_string($query)) {
        return '';
    }

    return mb_strtolower($query);
}

function tokenizeSemanticSearchText(string $text): array
{
    static $stopWords = [
        'a' => true, 'an' => true, 'and' => true, 'are' => true, 'at' => true, 'by' => true,
        'co' => true, 'company' => true, 'corp' => true, 'corporation' => true, 'de' => true,
        'el' => true, 'for' => true, 'from' => true, 'in' => true, 'inc' => true, 'into' => true,
        'is' => true, 'la' => true, 'las' => true, 'llc' => true, 'los' => true, 'ltd' => true,
        'me' => true, 'my' => true, 'near' => true, 'of' => true, 'on' => true, 'or' => true,
        'place' => true, 'places' => true, 'pllc' => true, 'take' => true, 'the' => true,
        'to' => true, 'with' => true, 'your' => true,
    ];
    preg_match_all('/[a-z0-9]+/i', mb_strtolower($text), $matches);
    $tokens = [];
    foreach ($matches[0] ?? [] as $token) {
        $token = trim((string)$token);
        if (mb_strlen($token) < 2 || isset($stopWords[$token])) {
            continue;
        }
        $tokens[$token] = true;
    }
    return array_keys($tokens);
}

function expandSemanticSearchIntentTokens(string $query, array $tokens): array
{
    $expanded = array_fill_keys($tokens, true);
    $lowerQuery = mb_strtolower($query);
    $intents = [
        [
            'match' => ['auto', 'autos', 'automotive', 'car', 'cars', 'vehicle', 'vehicles', 'truck', 'trucks'],
            'aliases' => [
                'auto', 'automotive', 'car', 'cars', 'vehicle', 'vehicles', 'truck', 'trucks', 'dealer',
                'dealership', 'motor', 'motors', 'mechanic', 'repair', 'garage', 'tire', 'tires',
                'collision', 'body', 'paint', 'parts', 'roadside', 'tow', 'towing', 'brake',
                'transmission', 'diesel', 'oil', 'motorsports',
            ],
        ],
        [
            'match' => ['coffee', 'cafe', 'cafes', 'espresso', 'latte'],
            'aliases' => ['coffee', 'cafe', 'espresso', 'latte', 'roaster', 'bakery', 'breakfast'],
        ],
        [
            'match' => ['childcare', 'daycare', 'preschool', 'children', 'child', 'kids'],
            'aliases' => ['childcare', 'daycare', 'preschool', 'children', 'child', 'kids', 'academy', 'learning', 'school', 'education', 'nursery', 'toddler', 'care'],
        ],
        [
            'match' => ['dentist', 'dentists', 'dental', 'teeth', 'orthodontist', 'orthodontic'],
            'aliases' => ['dentist', 'dentists', 'dental', 'teeth', 'tooth', 'orthodontist', 'orthodontic', 'oral', 'dds', 'dmd', 'hygiene'],
        ],
        [
            'match' => ['plumber', 'plumbers', 'plumbing'],
            'aliases' => ['plumber', 'plumbers', 'plumbing', 'pipe', 'pipes', 'drain', 'drains', 'sewer', 'leak', 'water', 'heater'],
        ],
        [
            'match' => ['roof', 'roofer', 'roofers', 'roofing'],
            'aliases' => ['roof', 'roofer', 'roofers', 'roofing', 'shingle', 'shingles', 'repair', 'repairs', 'storm'],
        ],
        [
            'match' => ['dog', 'dogs', 'pet', 'pets', 'animal', 'animals'],
            'aliases' => ['dog', 'dogs', 'pet', 'pets', 'animal', 'grooming', 'groomer', 'kennel', 'boarding', 'veterinary', 'vet', 'trainer'],
        ],
        [
            'match' => ['bar', 'bars', 'liquor', 'beer', 'wine', 'spirits', 'drinks'],
            'aliases' => ['bar', 'pub', 'tavern', 'cantina', 'liquor', 'beer', 'wine', 'spirits', 'cocktail', 'brewery', 'distillery', 'lounge'],
        ],
    ];

    foreach ($intents as $intent) {
        $matched = false;
        foreach ($intent['match'] as $needle) {
            if (in_array($needle, $tokens, true) || preg_match('/\b' . preg_quote($needle, '/') . '\b/u', $lowerQuery)) {
                $matched = true;
                break;
            }
        }
        if (!$matched) {
            continue;
        }
        foreach ($intent['aliases'] as $alias) {
            $expanded[$alias] = true;
        }
    }

    return array_keys($expanded);
}

function countSemanticTokenMatches(array $fieldTokens, array $queryTokens): array
{
    $fieldSet = array_fill_keys($fieldTokens, true);
    $exact = 0;
    $prefix = 0;
    foreach ($queryTokens as $token) {
        $token = (string)$token;
        if (isset($fieldSet[$token])) {
            $exact++;
            continue;
        }
        foreach ($fieldTokens as $entry) {
            $entry = (string)$entry;
            if (mb_strlen($token) < 3 || mb_strlen($entry) < 3) {
                continue;
            }
            if (str_starts_with($entry, $token) || (mb_strlen($entry) >= 4 && str_starts_with($token, $entry))) {
                $prefix++;
                break;
            }
        }
    }
    return ['exact' => $exact, 'prefix' => $prefix];
}

function scoreLocalSemanticRecord(array $point, string $query, array $baseTokens, array $queryTokens, array $clusterNames): float
{
    $name = mb_strtolower($point['name'] ?? '');
    $what = mb_strtolower($point['what'] ?? '');
    $city = mb_strtolower($point['city'] ?? '');
    $note = mb_strtolower($point['public_note'] ?? '');
    $clusterLabel = mb_strtolower($clusterNames[(int)($point['cluster'] ?? -1)] ?? '');
    $blob = trim($name . ' ' . $what . ' ' . $city . ' ' . $note . ' ' . $clusterLabel);
    $blobTokens = tokenizeSemanticSearchText($blob);
    $nameTokens = tokenizeSemanticSearchText($name);
    $whatTokens = tokenizeSemanticSearchText($what . ' ' . $clusterLabel);
    $noteTokens = tokenizeSemanticSearchText($note);
    $serviceTokens = array_values(array_unique(array_merge($whatTokens, $noteTokens, tokenizeSemanticSearchText($clusterLabel))));
    $baseTokenSet = array_fill_keys($baseTokens, true);
    $serviceTokenSet = array_fill_keys($serviceTokens, true);
    $blobTokenSet = array_fill_keys($blobTokens, true);

    $score = 0.0;
    if ($name === $query) {
        $score += 28;
    } elseif (str_starts_with($name, $query)) {
        $score += 18;
    } elseif (preg_match('/\b' . preg_quote($query, '/') . '\b/u', $name)) {
        $score += 13;
    } elseif (mb_strlen($query) >= 5 && str_contains($name, $query)) {
        $score += 9;
    }

    if (str_starts_with($what, $query)) {
        $score += 12;
    } elseif (preg_match('/\b' . preg_quote($query, '/') . '\b/u', $what . ' ' . $clusterLabel)) {
        $score += 9;
    } elseif (mb_strlen($query) >= 5 && str_contains($what . ' ' . $clusterLabel, $query)) {
        $score += 6;
    }

    if (preg_match('/\b' . preg_quote($query, '/') . '\b/u', $note)) {
        $score += 7;
    } elseif (mb_strlen($query) >= 5 && str_contains($note, $query)) {
        $score += 4;
    }

    $nameMatches = countSemanticTokenMatches($nameTokens, $baseTokens);
    $whatMatches = countSemanticTokenMatches($whatTokens, $baseTokens);
    $noteMatches = countSemanticTokenMatches($noteTokens, $baseTokens);
    $blobMatches = countSemanticTokenMatches($blobTokens, $queryTokens);

    $score += $nameMatches['exact'] * 8 + $nameMatches['prefix'] * 4;
    $score += $whatMatches['exact'] * 6 + $whatMatches['prefix'] * 3;
    $score += $noteMatches['exact'] * 4 + $noteMatches['prefix'] * 2;
    $score += min(7, $blobMatches['exact'] * 0.8 + $blobMatches['prefix'] * 0.35);

    $hasRoofIntent = isset($baseTokenSet['roof']) || isset($baseTokenSet['roofer']) || isset($baseTokenSet['roofers']) || isset($baseTokenSet['roofing']);
    if ($hasRoofIntent) {
        $hasRoofSignal = isset($blobTokenSet['roof']) || isset($blobTokenSet['roofer']) || isset($blobTokenSet['roofers']) || isset($blobTokenSet['roofing']) || isset($blobTokenSet['shingle']) || isset($blobTokenSet['shingles']);
        $hasOnlyGenericRepair = !$hasRoofSignal && (isset($blobTokenSet['repair']) || isset($blobTokenSet['repairs']));
        if ($hasRoofSignal) {
            $score += 18;
        } elseif ($hasOnlyGenericRepair) {
            $score -= 18;
        }
    }

    $hasPlumbingIntent = isset($baseTokenSet['plumber']) || isset($baseTokenSet['plumbers']) || isset($baseTokenSet['plumbing']);
    if ($hasPlumbingIntent) {
        $hasPlumbingSignal = isset($blobTokenSet['plumber']) || isset($blobTokenSet['plumbers']) || isset($blobTokenSet['plumbing']) || isset($serviceTokenSet['pipe']) || isset($serviceTokenSet['drain']) || isset($serviceTokenSet['sewer']);
        $looksLikeEvent = isset($blobTokenSet['tournament']) || isset($blobTokenSet['fishing']);
        $looksLikeHvacOnly = !$hasPlumbingSignal && (
            isset($blobTokenSet['hvac']) || isset($blobTokenSet['heating']) || isset($blobTokenSet['refrigeration'])
            || isset($blobTokenSet['cooling']) || isset($blobTokenSet['air']) || isset($blobTokenSet['ac'])
        );
        if ($hasPlumbingSignal && !$looksLikeEvent) {
            $score += 12;
        } elseif ($looksLikeEvent) {
            $score -= 10;
        } elseif ($looksLikeHvacOnly) {
            $score -= 8;
        }
    }

    if ((int)($point['cluster'] ?? -1) === 9 && array_intersect($queryTokens, ['auto', 'automotive', 'car', 'cars', 'vehicle', 'vehicles', 'truck', 'trucks', 'dealer', 'mechanic', 'repair', 'tire', 'tow', 'towing'])) {
        $score += 14;
    }
    if (($point['website'] ?? null)) {
        $score += 0.3;
    }
    if (($point['status'] ?? '') === 'active') {
        $score += 0.2;
    }

    return $score;
}

function buildLocalSemanticSearchPayload(array $points, array $clusterNames, string $query, int $limit, string $reason): array
{
    $normalizedQuery = normalizeSemanticSearchQuery($query);
    $baseTokens = tokenizeSemanticSearchText($normalizedQuery);
    $queryTokens = expandSemanticSearchIntentTokens($normalizedQuery, $baseTokens);
    $scored = [];

    foreach ($points as $point) {
        $leadId = (int)($point['lead_id'] ?? 0);
        if ($leadId <= 0) {
            continue;
        }
        $score = scoreLocalSemanticRecord($point, $normalizedQuery, $baseTokens, $queryTokens, $clusterNames);
        if ($score < 1.0) {
            continue;
        }
        $clusterLabel = $clusterNames[(int)($point['cluster'] ?? -1)] ?? 'Montgomery County business';
        $scored[] = [
            'lead_id' => $leadId,
            'name' => $point['name'] ?? 'Unknown business',
            'city' => $point['city'] ?? '',
            'status' => $point['status'] ?? '',
            'public_note' => $point['public_note'] ?? ($point['what'] ?? ''),
            'public_detail' => $point['public_note'] ?? '',
            'address' => '',
            'naics' => $clusterLabel,
            'score' => round($score, 6),
            'semantic_score' => null,
            'lexical_bonus' => round($score, 6),
            'retrieval_source' => 'lexical_fallback',
        ];
    }

    usort($scored, static function (array $a, array $b): int {
        $scoreCompare = ($b['score'] <=> $a['score']);
        if ($scoreCompare !== 0) {
            return $scoreCompare;
        }
        return ((int)$a['lead_id']) <=> ((int)$b['lead_id']);
    });

    return [
        'ok' => true,
        'query' => $query,
        'mode' => 'local_record_search_v1',
        'source' => 'local-records',
        'retrieval_source' => 'lexical_fallback',
        'retrieval_label' => 'Lexical fallback',
        'degraded' => true,
        'reason' => $reason,
        'count' => count($scored),
        'results' => array_slice($scored, 0, $limit),
    ];
}

function loadSemanticSearchCache(string $cacheFile, int $ttlSeconds): ?array
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
    $decoded['cache_source'] = 'file';
    return $decoded;
}

function waitForSemanticSearchCache(string $cacheFile, int $ttlSeconds, int $waitMs): ?array
{
    $deadline = microtime(true) + max(0, $waitMs) / 1000;
    do {
        $cached = loadSemanticSearchCache($cacheFile, $ttlSeconds);
        if (is_array($cached)) {
            return $cached;
        }
        usleep(120000);
    } while (microtime(true) < $deadline);

    return null;
}

function persistSemanticSearchCache(string $cacheFile, array $payload): void
{
    $dir = dirname($cacheFile);
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }

    $toStore = $payload;
    unset($toStore['cached'], $toStore['cache_age_seconds'], $toStore['cache_source']);
    $json = json_encode($toStore, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PRETTY_PRINT);
    if ($json !== false) {
        @file_put_contents($cacheFile, $json, LOCK_EX);
    }
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

function similarityFromCentroid(array $point, array $centroid): float
{
    $dx = (float)$point['x'] - $centroid[0];
    $dy = (float)$point['y'] - $centroid[1];
    $dz = (float)$point['z'] - $centroid[2];
    $distance = sqrt($dx * $dx + $dy * $dy + $dz * $dz);
    return 1.0 / (1.0 + $distance);
}

$dataPath = __DIR__ . DIRECTORY_SEPARATOR . 'data.dat';
if (!is_file($dataPath)) {
    respond(500, ['error' => 'Missing semantic dataset']);
}

$raw = json_decode((string)file_get_contents($dataPath), true);
if (!is_array($raw)) {
    respond(500, ['error' => 'Invalid semantic dataset']);
}

$points = [];
$clusters = [];

foreach ($raw as $row) {
    if (!is_array($row) || count($row) < 7) {
        continue;
    }

    $clusterId = (int)$row[3];
    $point = [
        'x' => (float)$row[0],
        'y' => (float)$row[1],
        'z' => (float)$row[2],
        'cluster' => $clusterId,
        'name' => cleanText($row[4]) ?? 'Unknown business',
        'what' => cleanText($row[5]) ?? 'Montgomery County business',
        'city' => cleanText($row[6]) ?? 'Montgomery County',
        'lead_id' => $row[7] ?? null,
        'website' => validWebsite(cleanText($row[10] ?? null)),
        'public_note' => cleanText($row[13] ?? null) ?? '',
        'status' => strtolower(cleanText($row[14] ?? null) ?? 'active'),
    ];

    $points[] = $point;
    $clusters[$clusterId][] = $point;
}

$action = $_GET['action'] ?? ((PHP_SAPI === 'cli' && isset($argv[1])) ? (string)$argv[1] : 'stats');

if ($action === 'semantic_guide_worker') {
    if (PHP_SAPI !== 'cli') {
        respond(403, ['ok' => false, 'error' => 'Worker action is CLI-only']);
    }

    $jobFile = isset($argv[2]) ? (string)$argv[2] : '';
    if ($jobFile === '' || !str_starts_with(realpath($jobFile) ?: '', realpath($semanticGuideJobDir) ?: $semanticGuideJobDir)) {
        respond(400, ['ok' => false, 'error' => 'Invalid guide job path']);
    }

    respond(200, processSemanticGuideJob(
        $jobFile,
        $semanticGuideCacheDir,
        $askMocoHealthUrl,
        $askMocoAskUrl,
        $semanticServiceHome,
        $askMocoStartScript
    ));
}

if ($action === 'stats') {
    respond(200, [
        'total_leads' => count($points),
        'num_categories' => count($clusters),
        'embedding_dim' => 1024,
    ]);
}

if ($action === 'semantic_lane_health') {
    requireSameHostReferrer();

    $requestedWarm = isset($_GET['warm']) && (string)$_GET['warm'] === '1';
    $warm = $requestedWarm && $semanticLaneHealthProbeRestartsEnabled;
    $snapshot = getSemanticLaneSnapshot(
        $semanticSearchHealthUrl,
        $semanticServiceHome,
        $semanticSearchStartScript,
        $semanticSearchStateFile,
        $embedServiceHealthUrl,
        $semanticServiceHome,
        $embedServiceStartScript,
        $embedServiceStateFile,
        $semanticLaneStateFile,
        $semanticLaneEventLog,
        $semanticLaneRestartCooldownSeconds,
        $semanticLaneRecoveryFreshSeconds,
        $warm,
        $warm ? 2 : 0
    );
    if ($requestedWarm && !$semanticLaneHealthProbeRestartsEnabled) {
        $snapshot['warm_restart_suppressed'] = true;
    }

    respond(200, $snapshot);
}

if ($action === 'semantic_lane_ops_summary') {
    requireSameHostReferrer();

    $snapshot = getSemanticLaneSnapshot(
        $semanticSearchHealthUrl,
        $semanticServiceHome,
        $semanticSearchStartScript,
        $semanticSearchStateFile,
        $embedServiceHealthUrl,
        $semanticServiceHome,
        $embedServiceStartScript,
        $embedServiceStateFile,
        $semanticLaneStateFile,
        $semanticLaneEventLog,
        $semanticLaneRestartCooldownSeconds,
        $semanticLaneRecoveryFreshSeconds,
        false,
        0
    );
    $summary = getSemanticLaneOpsSummary(
        $semanticLaneStateFile,
        $semanticLaneEventLog,
        $semanticLaneWatchdogLog
    );
    $summary['snapshot'] = $snapshot;

    respond(200, $summary);
}

if ($action === 'semantic_search') {
    requireSameHostReferrer();

    $query = trim((string)($_GET['q'] ?? ''));
    if (mb_strlen($query) < 2) {
        respond(400, ['ok' => false, 'error' => 'Query too short']);
    }

    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 18;
    $limit = max(1, min(48, $limit));

    $normalizedQuery = normalizeSemanticSearchQuery($query);
    $cacheKey = hash('sha256', 'semantic-search-v4|' . $normalizedQuery . '|' . $limit);
    $cacheFile = rtrim($semanticSearchCacheDir, '/\\') . DIRECTORY_SEPARATOR . $cacheKey . '.json';
    $lockFile = rtrim($semanticSearchCacheDir, '/\\') . DIRECTORY_SEPARATOR . $cacheKey . '.lock';

    $cached = loadSemanticSearchCache($cacheFile, $semanticSearchCacheTtlSeconds);
    if (is_array($cached)) {
        respondSemanticSearch(200, $cached);
    }

    if (!is_dir($semanticSearchCacheDir)) {
        @mkdir($semanticSearchCacheDir, 0775, true);
    }

    $lockHandle = @fopen($lockFile, 'c');
    $lockAcquired = is_resource($lockHandle) && @flock($lockHandle, LOCK_EX | LOCK_NB);
    if (!$lockAcquired) {
        $cached = waitForSemanticSearchCache($cacheFile, $semanticSearchCacheTtlSeconds, $semanticSearchCacheWaitMs);
        if (is_array($cached)) {
            if (is_resource($lockHandle)) {
                @fclose($lockHandle);
            }
            respondSemanticSearch(200, $cached);
        }
    } else {
        $cached = loadSemanticSearchCache($cacheFile, $semanticSearchCacheTtlSeconds);
        if (is_array($cached)) {
            @flock($lockHandle, LOCK_UN);
            @fclose($lockHandle);
            respondSemanticSearch(200, $cached);
        }
    }

    $searchServiceHealthy = serviceHealthy($semanticSearchHealthUrl, 1);
    if (!$searchServiceHealthy) {
        $fallback = buildLocalSemanticSearchPayload($points, $clusterNames, $query, $limit, 'semantic_service_offline');
        $fallback['cached'] = false;
        $fallback['cache_age_seconds'] = null;
        $fallback['cache_source'] = 'local-records';
        if ($lockAcquired && is_resource($lockHandle)) {
            @flock($lockHandle, LOCK_UN);
            @fclose($lockHandle);
        } elseif (is_resource($lockHandle)) {
            @fclose($lockHandle);
        }
        respondSemanticSearch(200, $fallback);
    }

    try {
        $serviceResponse = postJson('http://127.0.0.1:8020/search', [
            'query' => $query,
            'limit' => $limit,
        ], 8);

        if (!$serviceResponse['ok']) {
            $fallback = buildLocalSemanticSearchPayload($points, $clusterNames, $query, $limit, 'semantic_service_unavailable');
            $fallback['cached'] = false;
            $fallback['cache_age_seconds'] = null;
            $fallback['cache_source'] = 'local-records';
            $fallback['service_error'] = $serviceResponse['error'];
            respondSemanticSearch(200, $fallback);
        }

        $responseBody = $serviceResponse['body'];
        if ((int)$serviceResponse['status'] >= 200 && (int)$serviceResponse['status'] < 300 && (($responseBody['ok'] ?? true) !== false)) {
            $lexicalGuard = buildLocalSemanticSearchPayload($points, $clusterNames, $query, min($limit, 5), 'semantic_service_confidence_guard');
            if ((int)($lexicalGuard['count'] ?? 0) <= 0) {
                $responseBody['ok'] = true;
                $responseBody['query'] = $query;
                $responseBody['count'] = 0;
                $responseBody['results'] = [];
                $responseBody['confidence_guard'] = 'no_public_record_signal';
            }
            $responseBody['cached'] = false;
            $responseBody['cache_age_seconds'] = null;
            $responseBody['cache_source'] = 'service';
            persistSemanticSearchCache($cacheFile, $responseBody);
        }

        if ((int)$serviceResponse['status'] >= 500 || (($responseBody['ok'] ?? true) === false)) {
            $fallback = buildLocalSemanticSearchPayload($points, $clusterNames, $query, $limit, 'semantic_service_degraded');
            $fallback['cached'] = false;
            $fallback['cache_age_seconds'] = null;
            $fallback['cache_source'] = 'local-records';
            respondSemanticSearch(200, $fallback);
        }

        respondSemanticSearch((int)$serviceResponse['status'], $responseBody);
    } finally {
        if ($lockAcquired && is_resource($lockHandle)) {
            @flock($lockHandle, LOCK_UN);
            @fclose($lockHandle);
        } elseif (is_resource($lockHandle)) {
            @fclose($lockHandle);
        }
    }
}

if ($action === 'lead_context') {
    requireSameHostReferrer();

    $leadId = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if ($leadId <= 0) {
        respond(400, ['ok' => false, 'error' => 'Invalid lead id']);
    }

    $url = sprintf('http://127.0.0.1:8020/lead?id=%d', $leadId);
    $serviceResponse = getJson($url, 20, $semanticSearchHealthUrl, $semanticServiceHome, $semanticSearchStartScript, $embedServiceHealthUrl, $semanticServiceHome, $embedServiceStartScript, $semanticLaneStateFile, $semanticLaneEventLog, $semanticLaneRestartCooldownSeconds);

    if (!$serviceResponse['ok']) {
        respond((int)$serviceResponse['status'], [
            'ok' => false,
            'error' => $serviceResponse['error'],
        ]);
    }

    respond((int)$serviceResponse['status'], $serviceResponse['body']);
}

if ($action === 'semantic_trail_story') {
    requireSameHostReferrer();

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond(405, ['ok' => false, 'error' => 'Method not allowed']);
    }

    $request = readJsonRequestBody();
    $query = trimGuideText($request['query'] ?? '', 80);
    $results = normalizeSemanticGuideResults($request['results'] ?? []);
    if (mb_strlen($query) < 2 || count($results) < 1) {
        respond(400, ['ok' => false, 'error' => 'Story request needs a query and at least one result']);
    }

    $anchorLeadId = isset($request['anchor_lead_id']) ? (int)$request['anchor_lead_id'] : 0;
    $normalizedRequest = [
        'query' => $query,
        'view' => trimGuideText($request['view'] ?? 'galaxy', 16),
        'anchor_lead_id' => $anchorLeadId > 0 ? $anchorLeadId : null,
        'anchor_name' => trimGuideText($request['anchor_name'] ?? '', 90),
        'visible_matches' => max(1, (int)($request['visible_matches'] ?? count($results))),
        'results' => $results,
    ];

    $cacheKey = semanticGemmaTrailStoryCacheKey($normalizedRequest);
    $cacheFile = semanticGemmaCacheFile($semanticGemmaCacheDir, $cacheKey);
    $cached = loadSemanticGemmaTrailStoryCache($cacheFile, $semanticGemmaStoryCacheTtlSeconds);
    if (is_array($cached)) {
        $cached['cache_key'] = $cacheKey;
        respond(200, $cached);
    }

    $response = [
        'ok' => true,
        'mode' => 'cache_miss',
        'kind' => 'semantic_trail_story_v1',
        'cache_key' => $cacheKey,
        'cached' => false,
        'cache_age_seconds' => null,
        'pending_generation' => false,
        'queued' => false,
        'queueable' => true,
        'degraded' => true,
        'reason' => 'trail_story_not_cached',
    ];

    if (($request['include_job'] ?? false) === true) {
        $job = buildSemanticGemmaTrailStoryJob($normalizedRequest);
        $job['cache_key'] = $cacheKey;
        $response['job'] = $job;
    }

    respond(200, $response);
}

if ($action === 'semantic_guide') {
    requireSameHostReferrer();

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond(405, ['ok' => false, 'error' => 'Method not allowed']);
    }

    $request = readJsonRequestBody();
    $query = trimGuideText($request['query'] ?? '', 80);
    $results = normalizeSemanticGuideResults($request['results'] ?? []);
    if (mb_strlen($query) < 2 || count($results) < 1) {
        respond(400, ['ok' => false, 'error' => 'Guide request needs a query and at least one result']);
    }

    $anchorLeadId = isset($request['anchor_lead_id']) ? (int)$request['anchor_lead_id'] : 0;
    $normalizedRequest = [
        'query' => $query,
        'view' => trimGuideText($request['view'] ?? 'galaxy', 16),
        'anchor_lead_id' => $anchorLeadId > 0 ? $anchorLeadId : null,
        'anchor_name' => trimGuideText($request['anchor_name'] ?? '', 90),
        'visible_matches' => max(1, (int)($request['visible_matches'] ?? count($results))),
        'results' => $results,
    ];

    $suggestions = buildSemanticGuideSuggestions($results, $normalizedRequest['anchor_lead_id']);
    
    // 10/10 Polish: Local Development Mode (Safe Mode)
    if ($isDevMode) {
        $title = $normalizedRequest['anchor_name'] !== '' 
            ? $normalizedRequest['anchor_name'] . ' anchors this trail'
            : 'Search guide for "' . $query . '"';
        
        $summary = 'The mycelium is flourishing. We found ' . count($results) . ' matches for "' . $query . '". ' .
                   'The strongest connection is ' . ($normalizedRequest['anchor_name'] ?: 'the primary anchor') . '. ' .
                   'This cluster shows strong signals in ' . ($results[0]['naics'] ?? 'the local market') . '.';

        respond(200, [
            'ok' => true,
            'query' => $query,
            'title' => $title,
            'summary' => $summary,
            'suggestions' => $suggestions,
            'source' => 'local-mock',
            'is_cached' => false,
            'pending_generation' => false,
            'queued' => false
        ]);
    }

    $fallbackPayload = buildSemanticGuideFallback($normalizedRequest, $suggestions, 'llm_unavailable');
    $cacheKey = semanticGuideCacheKey($normalizedRequest);
    if (!is_dir($semanticGuideCacheDir)) {
        @mkdir($semanticGuideCacheDir, 0775, true);
    }
    $cacheFile = semanticGuideCacheFile($semanticGuideCacheDir, $cacheKey);

    $cached = loadSemanticGuideCache($cacheFile, $semanticGuideCacheTtlSeconds);
    if (is_array($cached)) {
        respond(200, $cached);
    }

    $queued = enqueueSemanticGuideJob($semanticGuideJobDir, $semanticGuideCacheDir, $cacheKey, $normalizedRequest);
    if ($queued) {
        kickService($semanticServiceHome, $semanticGuideWorkerScript);
    }

    $responsePayload = buildSemanticGuideFallback(
        $normalizedRequest,
        $suggestions,
        $queued ? 'queued_generation' : 'queue_unavailable'
    );
    $responsePayload['pending_generation'] = $queued;
    $responsePayload['queued'] = $queued;

    respond(200, $responsePayload);
}

if ($action === 'categories') {
    $categories = [];
    ksort($clusters);
    foreach ($clusters as $clusterId => $members) {
        $label = $clusterNames[$clusterId] ?? 'Other';
        $activeCount = count(array_filter($members, static fn(array $member): bool => $member['status'] !== 'disqualified'));
        $websiteCount = count(array_filter($members, static fn(array $member): bool => $member['website'] !== null));
        $categories[] = [
            'id' => $clusterId,
            'name' => $label,
            'description' => sprintf(
                '%s records in this county theme · %s with websites · %s active',
                number_format(count($members)),
                number_format($websiteCount),
                number_format($activeCount)
            ),
        ];
    }

    respond(200, ['categories' => $categories]);
}

if ($action === 'category') {
    requireSameHostReferrer();

    $categoryId = isset($_GET['id']) ? (int)$_GET['id'] : -1;
    if (!isset($clusters[$categoryId])) {
        respond(404, ['error' => 'Unknown category']);
    }

    $members = $clusters[$categoryId];
    $count = count($members);
    $centroid = [0.0, 0.0, 0.0];
    foreach ($members as $member) {
        $centroid[0] += $member['x'];
        $centroid[1] += $member['y'];
        $centroid[2] += $member['z'];
    }
    $centroid[0] /= max($count, 1);
    $centroid[1] /= max($count, 1);
    $centroid[2] /= max($count, 1);

    usort($members, static function (array $a, array $b) use ($centroid): int {
        $aScore = similarityFromCentroid($a, $centroid) + ($a['website'] ? 0.02 : 0.0) + ($a['status'] === 'active' ? 0.01 : 0.0);
        $bScore = similarityFromCentroid($b, $centroid) + ($b['website'] ? 0.02 : 0.0) + ($b['status'] === 'active' ? 0.01 : 0.0);
        return $bScore <=> $aScore;
    });

    $topMatches = [];
    foreach (array_slice($members, 0, 12) as $member) {
        $topMatches[] = [
            'lead_id' => $member['lead_id'],
            'name' => $member['name'],
            'website' => $member['website'],
            'similarity' => round(similarityFromCentroid($member, $centroid), 4),
        ];
    }

    $label = $clusterNames[$categoryId] ?? 'Other';
    respond(200, [
        'category' => [
            'id' => $categoryId,
            'name' => $label,
            'description' => sprintf(
                '%s semantic matches orbiting %s in the Montgomery County corpus.',
                number_format($count),
                strtolower($label)
            ),
            'top_matches' => $topMatches,
        ],
    ]);
}

respond(400, ['error' => 'Unknown action']);
