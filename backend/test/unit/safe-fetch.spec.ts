import { describe, expect, it } from 'vitest';
import { fetchPublicPage, isPrivateAddress, vettedLookup } from '@/modules/recipes/infrastructure/safe-fetch.js';

describe('recipe import fetch guard', () => {
  it('treats loopback, private, link-local, metadata and multicast addresses as private', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.7', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1'])
      expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ['93.184.216.34', '172.32.0.1', '8.8.8.8', '2606:4700::1111'])
      expect(isPrivateAddress(ip), ip).toBe(false);
  });
  it('refuses local, non-web and odd-port links before any request', async () => {
    await expect(fetchPublicPage('http://127.0.0.1:3000/graphql')).rejects.toThrow(/http or https|private/);
    await expect(fetchPublicPage('http://localhost/')).rejects.toThrow(/private/);
    await expect(fetchPublicPage('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/private/);
    await expect(fetchPublicPage('file:///etc/passwd')).rejects.toThrow(/http or https/);
    await expect(fetchPublicPage('https://user:pass@example.com/')).rejects.toThrow(/http or https/);
    await expect(fetchPublicPage('not a link')).rejects.toThrow(/not a web link/);
  });
});

describe('vettedLookup', () => {
  const run = (host: string, all: boolean) => new Promise<{ error: Error | null; address: unknown }>(resolve =>
    vettedLookup(host, { all }, ((error: Error | null, address: unknown) => resolve({ error, address })) as never));
  it('refuses a host whose answer is private, in both lookup forms the socket uses', async () => {
    for (const all of [true, false]) expect((await run('localhost', all)).error?.message).toBe('localhost');
  });
});
