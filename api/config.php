<?php
declare(strict_types=1);

/**
 * Environment-driven configuration for the semantic search API.
 *
 * All topology values (home directory, service ports, cache paths) can be
 * overridden via environment variables. The hardcoded defaults below preserve
 * backward compatibility with the current mccullough-cloud/Hostinger deploy.
 *
 * Override via: .env file (if a loader is present), web server env, or
 * system-level environment.  Individual port overrides are supported; the
 * full health/start URLs can also be set directly via their own env vars.
 */

// ---------------------------------------------------------------------------
// Helper: read an env var with a fallback.
// ---------------------------------------------------------------------------
function _env(string $key, mixed $default = null): mixed
{
    $val = getenv($key);
    if ($val !== false && $val !== '') {
        return $val;
    }
    // Also check $_ENV / $_SERVER (covers web-server-set environment).
    if (isset($_ENV[$key]) && $_ENV[$key] !== '') {
        return $_ENV[$key];
    }
    if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') {
        return $_SERVER[$key];
    }
    return $default;
}

function _env_int(string $key, int $default): int
{
    $raw = _env($key);
    if ($raw === null) {
        return $default;
    }
    $val = (int)$raw;
    return $val > 0 ? $val : $default;
}

function _env_bool(string $key, bool $default): bool
{
    $raw = _env($key);
    if ($raw === null) {
        return $default;
    }
    $normalized = strtolower(trim((string)$raw));
    return in_array($normalized, ['1', 'true', 'yes', 'on'], true);
}

// ---------------------------------------------------------------------------
// Cluster names (not env-driven — these are the fixed Montgomery County themes).
// ---------------------------------------------------------------------------
$clusterNames = [
    0 => 'General Business',
    1 => 'Professional Services',
    2 => 'Food & Hospitality',
    3 => 'Construction & Trades',
    4 => 'Retail & Shops',
    5 => 'Beauty & Wellness',
    6 => 'Real Estate & Property',
    7 => 'Industrial & Logistics',
    8 => 'Agriculture & Ranching',
    9 => 'Automotive',
    10 => 'Healthcare & Medical',
    11 => 'Therapy & Counseling',
    12 => 'Education & Childcare',
    13 => 'Churches',
    14 => 'Faith Ministries',
    15 => 'Community Nonprofits',
    16 => 'Foundations',
    17 => 'Arts & Culture',
    18 => 'Economic Development',
    19 => 'Public Agencies',
    20 => 'Enterprise Brands',
];

// ---------------------------------------------------------------------------
// Service home directory (the base path for scripts, state, and cache).
// Default is the current mccullough-cloud production path.
// Override: SEMANTIC_SERVICE_HOME
// ---------------------------------------------------------------------------
$semanticServiceHome = _env('SEMANTIC_SERVICE_HOME', '/home/u741831384');

// ---------------------------------------------------------------------------
// Service ports — each service's health URL and listen port can be overridden.
// Override individual ports or set the full health URL directly.
// ---------------------------------------------------------------------------
$semanticSearchPort = _env_int('SEMANTIC_SEARCH_PORT', 8020);
$embedServicePort   = _env_int('EMBED_SERVICE_PORT', 8019);
$askMocoPort        = _env_int('ASK_MOCO_PORT', 8008);

$semanticSearchHealthUrl = _env('SEMANTIC_SEARCH_HEALTH_URL', 'http://127.0.0.1:' . $semanticSearchPort . '/healthz');
$embedServiceHealthUrl   = _env('EMBED_SERVICE_HEALTH_URL', 'http://127.0.0.1:' . $embedServicePort . '/healthz');
$askMocoHealthUrl        = _env('ASK_MOCO_HEALTH_URL', 'http://127.0.0.1:' . $askMocoPort . '/healthz');
$askMocoAskUrl           = _env('ASK_MOCO_ASK_URL', 'http://127.0.0.1:' . $askMocoPort . '/ask');

// ---------------------------------------------------------------------------
// Script paths (derived from service home, but individually overridable).
// ---------------------------------------------------------------------------
$semanticSearchStartScript  = _env('SEMANTIC_SEARCH_START_SCRIPT', $semanticServiceHome . '/bin/start-public-semantic-search');
$embedServiceStartScript    = _env('EMBED_SERVICE_START_SCRIPT', $semanticServiceHome . '/bin/start-qwen-embed-service');
$askMocoStartScript         = _env('ASK_MOCO_START_SCRIPT', $semanticServiceHome . '/bin/start-ask-moco-service');
$semanticGuideWorkerScript  = _env('SEMANTIC_GUIDE_WORKER_SCRIPT', $semanticServiceHome . '/bin/run-semantic-guide-worker');

// ---------------------------------------------------------------------------
// State file paths.
// ---------------------------------------------------------------------------
$semanticSearchStateFile  = _env('SEMANTIC_SEARCH_STATE_FILE', $semanticServiceHome . '/ai/public_semantic_search.state.json');
$embedServiceStateFile    = _env('EMBED_SERVICE_STATE_FILE', $semanticServiceHome . '/ai/qwen_embed_service.state.json');
$semanticLaneStateFile    = _env('SEMANTIC_LANE_STATE_FILE', $semanticServiceHome . '/ai/semantic_lane_state.json');

// ---------------------------------------------------------------------------
// Cache directories.
// ---------------------------------------------------------------------------
$semanticSearchCacheDir   = _env('SEMANTIC_SEARCH_CACHE_DIR', $semanticServiceHome . '/ai/semantic_search_cache');
$semanticGuideCacheDir    = _env('SEMANTIC_GUIDE_CACHE_DIR', $semanticServiceHome . '/ai/semantic_guide_cache');
$semanticGuideJobDir      = _env('SEMANTIC_GUIDE_JOB_DIR', $semanticServiceHome . '/ai/semantic_guide_jobs');
$semanticGemmaCacheDir    = _env('SEMANTIC_GEMMA_CACHE_DIR', $semanticServiceHome . '/ai/semantic_gemma_cache');

// ---------------------------------------------------------------------------
// Cache tuning.
// ---------------------------------------------------------------------------
$semanticSearchCacheTtlSeconds = _env_int('SEMANTIC_SEARCH_CACHE_TTL_SECONDS', 21600);
$semanticSearchCacheWaitMs     = _env_int('SEMANTIC_SEARCH_CACHE_WAIT_MS', 1800);
$semanticGuideCacheTtlSeconds  = _env_int('SEMANTIC_GUIDE_CACHE_TTL_SECONDS', 21600);
$semanticGuideCacheWaitMs      = _env_int('SEMANTIC_GUIDE_CACHE_WAIT_MS', 1800);
$semanticGemmaStoryCacheTtlSeconds = _env_int('SEMANTIC_GEMMA_STORY_CACHE_TTL_SECONDS', 604800);

// ---------------------------------------------------------------------------
// Lane watchdog / recovery.
// ---------------------------------------------------------------------------
$semanticLaneEventLog               = _env('SEMANTIC_LANE_EVENT_LOG', $semanticServiceHome . '/ai/semantic_lane_events.log');
$semanticLaneWatchdogLog            = _env('SEMANTIC_LANE_WATCHDOG_LOG', $semanticServiceHome . '/ai/semantic_lane_watchdog.log');
$semanticLaneRestartCooldownSeconds = _env_int('SEMANTIC_LANE_RESTART_COOLDOWN_SECONDS', 45);
$semanticLaneRecoveryFreshSeconds   = _env_int('SEMANTIC_LANE_RECOVERY_FRESH_SECONDS', 90);
$semanticLaneHealthProbeRestartsEnabled = _env_bool('SEMANTIC_LANE_HEALTH_PROBE_RESTARTS_ENABLED', false);

// ---------------------------------------------------------------------------
// Local Development Mode (Safe Mode)
// Enables mocks for local development to avoid 30s timeouts on missing services.
// ---------------------------------------------------------------------------
$isDevMode = (($_SERVER['HTTP_HOST'] ?? '') === 'localhost' || ($_SERVER['HTTP_HOST'] ?? '') === '127.0.0.1' || is_file(dirname(__DIR__) . '/.local-dev-active'));
