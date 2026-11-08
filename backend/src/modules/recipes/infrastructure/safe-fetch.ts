import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { DomainError } from '@/shared/domain-error.js';

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 4;

/** True for addresses a server must never be tricked into calling: loopback, private, link-local, metadata, multicast. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^::ffff:/, '');
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
  }
  if (isIP(ip) === 6) return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^ff/.test(ip);
  return true;
}

const unreadable = (detail: string) => new DomainError('RECIPE_PAGE_UNREADABLE', `Remi couldn't read that page (${detail}).`, 422);

/**
 * Fetches a public web page for recipe import. Only http(s) on the standard ports, never a private or local address
 * (checked again after every redirect), with a 10 second timeout and a 3 MB cap.
 * shortcut: the address is checked by a DNS lookup before the request, so a host that changes its DNS answer in
 * between (rebinding) could slip through; pin the resolved address in a custom agent before exposing this widely.
 */
export async function fetchPublicPage(rawUrl: string): Promise<{ url: string; html: string }> {
  let url = rawUrl.trim();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new DomainError('RECIPE_URL_INVALID', 'That is not a web link.', 422); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || (parsed.port && !['80', '443'].includes(parsed.port))) {
      throw new DomainError('RECIPE_URL_INVALID', 'Only ordinary http or https links can be imported.', 422);
    }
    const addresses = isIP(parsed.hostname) ? [{ address: parsed.hostname }] : await lookup(parsed.hostname, { all: true }).catch(() => []);
    if (!addresses.length) throw unreadable('the site could not be found');
    if (addresses.some(a => isPrivateAddress(a.address))) throw new DomainError('RECIPE_URL_INVALID', 'That link points to a private network address.', 422);
    let response: Response;
    try {
      response = await fetch(parsed, { redirect: 'manual', signal: AbortSignal.timeout(10_000),
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; RemiRecipeImporter/1.0)', accept: 'text/html,application/xhtml+xml', 'accept-language': 'en,ar;q=0.8' } });
    } catch { throw unreadable('the site did not answer'); }
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) { url = new URL(location, parsed).toString(); continue; }
    if (!response.ok) throw unreadable(`the site answered ${response.status}`);
    if (!/html|xml/i.test(response.headers.get('content-type') ?? 'text/html')) throw unreadable('it is not a web page');
    const reader = response.body?.getReader();
    if (!reader) throw unreadable('the page was empty');
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { await reader.cancel(); break; } // recipe data sits in the <head>; a cut page still has it
      chunks.push(value);
    }
    return { url: parsed.toString(), html: Buffer.concat(chunks).toString('utf8') };
  }
  throw unreadable('it redirected too many times');
}
