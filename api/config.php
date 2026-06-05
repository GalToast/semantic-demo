<?php
declare(strict_types=1);

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

$semanticServiceHome = '/home/u741831384';
$semanticSearchHealthUrl = 'http://127.0.0.1:8020/healthz';
$semanticSearchStartScript = $semanticServiceHome . '/bin/start-public-semantic-search';
$semanticSearchStateFile = $semanticServiceHome . '/ai/public_semantic_search.state.json';
$embedServiceHealthUrl = 'http://127.0.0.1:8019/healthz';
$embedServiceStartScript = $semanticServiceHome . '/bin/start-qwen-embed-service';
$embedServiceStateFile = $semanticServiceHome . '/ai/qwen_embed_service.state.json';
$askMocoHealthUrl = 'http://127.0.0.1:8008/healthz';
$askMocoAskUrl = 'http://127.0.0.1:8008/ask';
$askMocoStartScript = $semanticServiceHome . '/bin/start-ask-moco-service';
$semanticSearchCacheDir = $semanticServiceHome . '/ai/semantic_search_cache';
$semanticSearchCacheTtlSeconds = 21600;
$semanticSearchCacheWaitMs = 1800;
$semanticGuideCacheDir = $semanticServiceHome . '/ai/semantic_guide_cache';
$semanticGuideJobDir = $semanticServiceHome . '/ai/semantic_guide_jobs';
$semanticGuideWorkerScript = $semanticServiceHome . '/bin/run-semantic-guide-worker';
$semanticGuideCacheTtlSeconds = 21600;
$semanticGuideCacheWaitMs = 1800;
$semanticGemmaCacheDir = $semanticServiceHome . '/ai/semantic_gemma_cache';
$semanticGemmaStoryCacheTtlSeconds = 604800;
$semanticLaneEventLog = $semanticServiceHome . '/ai/semantic_lane_events.log';
$semanticLaneStateFile = $semanticServiceHome . '/ai/semantic_lane_state.json';
$semanticLaneWatchdogLog = $semanticServiceHome . '/ai/semantic_lane_watchdog.log';
$semanticLaneRestartCooldownSeconds = 45;
$semanticLaneRecoveryFreshSeconds = 90;
$semanticLaneHealthProbeRestartsEnabled = false;

// 10/10 Polish: Local Development Mode (Safe Mode)
// Enables mocks for local development to avoid 30s timeouts on missing services.
$isDevMode = (($_SERVER['HTTP_HOST'] ?? '') === 'localhost' || ($_SERVER['HTTP_HOST'] ?? '') === '127.0.0.1' || is_file(dirname(__DIR__) . '/.local-dev-active'));
