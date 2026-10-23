export function resolveBackendUrl(options: {
  explicitUrl?: string; development: boolean; platform: string; hostUri?: string | null; webHostname?: string;
}): string {
  if (options.explicitUrl?.trim()) {
    const url = new URL(options.explicitUrl.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('Backend URL must be an HTTP(S) base URL without credentials, query, or fragment.');
    }
    return url.toString().replace(/\/$/, '');
  }
  if (!options.development) throw new Error('Set EXPO_PUBLIC_API_URL for this build.');
  // Web uses its own host; native uses Metro's LAN host, never its port.
  const host = options.platform === 'web' ? options.webHostname : options.hostUri;
  if (host) {
    const url = new URL(host.includes('://') ? host : `http://${host}`);
    if (/\.(exp\.direct|expo\.dev)$/.test(url.hostname)) {
      throw new Error('Expo tunnels do not expose the backend. Set EXPO_PUBLIC_API_URL to a reachable backend URL.');
    }
    url.protocol = 'http:';
    url.port = '3000';
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  }
  return options.platform === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

export class BackendError extends Error {
  constructor(message: string, readonly status?: number, readonly codes: string[] = []) {
    super(message);
    this.name = 'BackendError';
  }
}

export function createBackendClient(baseUrl: string, transport: typeof fetch = fetch) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await transport(`${baseUrl}${path}`, { ...init, signal: controller.signal });
      if (!response.ok) throw new BackendError(`Backend HTTP ${response.status}`, response.status);
      return await response.json() as T;
    } catch (error) {
      if (error instanceof BackendError) throw error;
      throw new BackendError('Backend request failed. Check the URL, server, network, firewall, and web CORS configuration.');
    } finally {
      clearTimeout(timer);
    }
  }
  async function graphql<T>(query: string, variables: Record<string, unknown> = {}, session?: { accessToken: string; householdId?: string }) {
    const result = await request<{ data?: T; errors?: { message: string; extensions?: { code?: string } }[] }>('/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        ...(session?.householdId ? { 'x-household-id': session.householdId } : {}) },
      body: JSON.stringify({ query, variables }),
    });
    if (result.errors?.length) throw new BackendError(result.errors.map((e) => e.message).join('; '), undefined,
      result.errors.flatMap((e) => e.extensions?.code ? [e.extensions.code] : []));
    if (result.data === undefined || result.data === null) throw new BackendError('Backend returned no GraphQL data.');
    return result.data;
  }
  return {
    graphql,
    async checkConnection() {
      const health = await request<{ status: string }>('/health/live');
      if (health.status !== 'ok') throw new BackendError('Backend liveness check failed.');
      const data = await graphql<{ __typename: string; foods: { nodes: { id: string }[] } }>(
        '{ __typename foods(first: 1) { nodes { id } } }');
      if (data.__typename !== 'Query' || !Array.isArray(data.foods?.nodes)) throw new BackendError('Unexpected GraphQL response.');
      return data;
    },
  };
}
