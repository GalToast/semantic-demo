/**
 * Generate minimal test data with guaranteed semantic thread connections.
 *
 * Usage:
 *   node scripts/generate-test-data.mjs
 *
 * Creates:
 *  测试 Point-premiums   Nunit_premium_test_pointsscripts/generate-test-data.mjsGenerating config artifact: create a minimal test data set that provides guaranteed semantic thread connections. Usage: node scripts/generate-test-data.mjs. The script creates two files in tests/test-data/: test-data.dat (3 points) and test-semantic-threads.dat (thread JSON). These files guarantee that node_0 has neighbors, establishing a deterministic test path for verifying the focus-pocket builder and filter chips. The approach includes:

1. Reading the first 5 points from data.dat
2. Generating a minimal test data set with known semantic thread connections
3. Ensuring node 0 has semantic neighbors
4. Creating a deterministic test path

The script handles data parsing, thread generation, and test data creation, providing a reliable method for testing semantic thread connections without relying on complex data generation mechanisms.
 */
