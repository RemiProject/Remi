const endpoint = process.env.PHASE11_API_URL ?? 'http://127.0.0.1:3000/graphql';
const accessToken = process.env.PHASE11_ACCESS_TOKEN;
const householdId = process.env.PHASE11_HOUSEHOLD_ID;
const concurrency = Math.max(1, Math.min(20, Number(process.env.PHASE11_CONCURRENCY ?? 5)));
const requests = Math.max(1, Math.min(10_000, Number(process.env.PHASE11_REQUESTS ?? 100)));
if (!accessToken || !householdId) throw new Error('Set PHASE11_ACCESS_TOKEN and PHASE11_HOUSEHOLD_ID. Do not pass tokens as command-line arguments.');

const operations = [
  { name: 'inventory', query: `query LoadInventory { inventory(first: 20) { nodes { id quantity unit } hasNextPage } }` },
  { name: 'recommendations', query: `query LoadRecommendations { recommendations(type: SUPPLY_NEED, first: 20) { nodes { id generatedAt } pageInfo { hasNextPage } } }` },
  { name: 'search', query: `query LoadSearch { search(query: "tomato", first: 10) {
      ... on SearchFoodResult { id score }
      ... on SearchRecipeResult { id score }
      ... on SearchMealResult { id score }
    } }` },
];

const samples = [];
let next = 0;
const failures = [];
async function worker() {
  while (next < requests) {
    const index = next++;
    const operation = operations[index % operations.length];
    const started = performance.now();
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', 'x-household-id': householdId },
        body: JSON.stringify({ query: operation.query, operationName: operation.name === 'inventory' ? 'LoadInventory' : operation.name === 'recommendations' ? 'LoadRecommendations' : 'LoadSearch' }),
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await response.json();
      const seconds = (performance.now() - started) / 1000;
      samples.push({ operation: operation.name, seconds, status: response.status });
      if (!response.ok || payload.errors?.length) failures.push({ operation: operation.name, status: response.status, code: payload.errors?.[0]?.extensions?.code ?? 'HTTP_ERROR' });
    } catch (error) {
      samples.push({ operation: operation.name, seconds: (performance.now() - started) / 1000, status: 0 });
      failures.push({ operation: operation.name, status: 0, code: error instanceof Error ? error.name : 'REQUEST_ERROR' });
    }
  }
}

const started = new Date();
const clockStarted = performance.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const grouped = Object.groupBy(samples, (sample) => sample.operation);
const percentile = (values, p) => values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)];
const summary = Object.fromEntries(Object.entries(grouped).map(([name, entries]) => {
  const sorted = entries.map((entry) => entry.seconds).sort((a, b) => a - b);
  return [name, { requests: sorted.length, p50_ms: Math.round(percentile(sorted, 0.5) * 1000), p95_ms: Math.round(percentile(sorted, 0.95) * 1000), p99_ms: Math.round(percentile(sorted, 0.99) * 1000) }];
}));
console.log(JSON.stringify({ startedAt: started.toISOString(), endpoint, requests: samples.length, concurrency, durationMs: Math.round(performance.now() - clockStarted), operations: summary, failures }, null, 2));
if (failures.length) process.exitCode = 1;
