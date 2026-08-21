<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Origin: *');
// Defense-in-depth: JSON-only API must never be sniffed into HTML/JS.
// The .htaccess sets this for static assets; the PHP response sets its own
// because the built-in dev server (php -S) does not process .htaccess.
header('X-Content-Type-Options: nosniff');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept, X-Requested-With');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/api/config.php';
require_once __DIR__ . '/api/utils.php';
require_once __DIR__ . '/api/supervisor.php';
require_once __DIR__ . '/api/search.php';
require_once __DIR__ . '/api/guide.php';

function getSemanticDataset(): array
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }

    // PR-N: search multiple candidate locations for data.dat so dev mode
    // works without a manual copy. Production deploys drop data.dat next
    // to api.php (canonical). Dev falls through to src/data.dat so a
    // fresh checkout works the moment PHP CLI server starts.
    $candidates = [
        __DIR__ . DIRECTORY_SEPARATOR . 'data.dat',
        __DIR__ . DIRECTORY_SEPARATOR . 'src' . DIRECTORY_SEPARATOR . 'data.dat'
    ];
    $dataPath = null;
    foreach ($candidates as $candidate) {
        if (is_file($candidate)) {
            $dataPath = $candidate;
            break;
        }
    }
    if ($dataPath === null) {
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
            // NAICS code (e.g. "624410" or "611512"). Optional column added
            // at index 15 by scripts/augment_data.py. Records without a NAICS
            // fall through to text matching in the PHP search fallback code.
            'naics' => cleanText($row[15] ?? null),
        ];

        $points[] = $point;
        $clusters[$clusterId][] = $point;
    }

    $cache = ['points' => $points, 'clusters' => $clusters];
    return $cache;
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
    $dataset = getSemanticDataset();
    respond(200, [
        'total_leads' => count($dataset['points']),
        'num_categories' => count($dataset['clusters']),
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
    // M11 fix: honor ?offset= for pagination so page>1 doesn't return page-1 dupes.
    $offset = isset($_GET['offset']) ? max(0, (int)$_GET['offset']) : 0;

    $normalizedQuery = normalizeSemanticSearchQuery($query);
    $cacheKey = hash('sha256', 'semantic-search-v4|' . $normalizedQuery . '|' . $limit . '|' . $offset);
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
        $dataset = getSemanticDataset();
        $fallback = buildLocalSemanticSearchPayload($dataset['points'], $clusterNames, $query, $limit, 'semantic_service_offline', $offset);
        $fallback['cached'] = false;
        $fallback['cache_age_seconds'] = null;
        $fallback['cache_source'] = 'local-records';
        // Persist the local-record fallback so subsequent requests skip the
        // 1s serviceHealthy probe (semantic service is offline in dev).
        persistSemanticSearchCache($cacheFile, $fallback);
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
            'offset' => $offset,
        ], 8);

        if (!$serviceResponse['ok']) {
            $dataset = getSemanticDataset();
            $fallback = buildLocalSemanticSearchPayload($dataset['points'], $clusterNames, $query, $limit, 'semantic_service_unavailable', $offset);
            $fallback['cached'] = false;
            $fallback['cache_age_seconds'] = null;
            $fallback['cache_source'] = 'local-records';
            $fallback['service_error'] = $serviceResponse['error'];
            persistSemanticSearchCache($cacheFile, $fallback);
            respondSemanticSearch(200, $fallback);
        }

        $responseBody = $serviceResponse['body'];
        if ((int)$serviceResponse['status'] >= 200 && (int)$serviceResponse['status'] < 300 && (($responseBody['ok'] ?? true) !== false)) {
            $dataset = getSemanticDataset();
            $lexicalGuard = buildLocalSemanticSearchPayload($dataset['points'], $clusterNames, $query, min($limit, 5), 'semantic_service_confidence_guard');
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
            $dataset = getSemanticDataset();
            $fallback = buildLocalSemanticSearchPayload($dataset['points'], $clusterNames, $query, $limit, 'semantic_service_degraded', $offset);
            $fallback['cached'] = false;
            $fallback['cache_age_seconds'] = null;
            $fallback['cache_source'] = 'local-records';
            persistSemanticSearchCache($cacheFile, $fallback);
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

    if ($isDevMode) {
        $title = $normalizedRequest['anchor_name'] !== ''
            ? $normalizedRequest['anchor_name'] . ' anchors this trail'
            : 'Search guide for \"' . $query . '\"';

        $summary = 'The mycelium is flourishing. We found ' . count($results) . ' matches for \"' . $query . '\". ' .
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
    $dataset = getSemanticDataset();
    $categories = [];
    ksort($dataset['clusters']);
    foreach ($dataset['clusters'] as $clusterId => $members) {
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
    $dataset = getSemanticDataset();
    if (!isset($dataset['clusters'][$categoryId])) {
        respond(404, ['error' => 'Unknown category']);
    }

    $members = $dataset['clusters'][$categoryId];
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