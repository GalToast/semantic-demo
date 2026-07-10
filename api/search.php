<?php
declare(strict_types=1);

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

function buildLocalSemanticSearchPayload(array $points, array $clusterNames, string $query, int $limit, string $reason, int $offset = 0): array
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
        // Use actual NAICS code when available; fall back to cluster label
        // for display. The JS-side search code matches on NAICS prefix when
        // the field is present (e.g. "624410").
        $naicsValue = ($point['naics'] ?? null) ?: $clusterLabel;
        $scored[] = [
            'lead_id' => $leadId,
            'name' => $point['name'] ?? 'Unknown business',
            'city' => $point['city'] ?? '',
            'status' => $point['status'] ?? '',
            'public_note' => $point['public_note'] ?? ($point['what'] ?? ''),
            'public_detail' => $point['public_note'] ?? '',
            'address' => '',
            'naics' => $naicsValue,
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
        'results' => array_slice($scored, $offset, $limit),
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
