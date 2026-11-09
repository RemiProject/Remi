import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
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

class PrivateAddressError extends Error { readonly code = 'PRIVATE_ADDRESS'; }

/**
 * The socket's own DNS lookup: it resolves the host once, refuses the connection when any answer is private, and
 * connects to exactly the answer it checked. A host that changes its DNS answer between a check and the connection
 * (rebinding) has no gap to use.
 */
export const vettedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { all: true, family: options.family }, (error, addresses: LookupAddress[]) => {
    if (error || !addresses.length) return callback(error ?? Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' }), '', 0);
    if (addresses.some(a => isPrivateAddress(a.address))) return callback(new PrivateAddressError(hostname), '', 0);
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
};

function get(url: URL, signal: AbortSignal): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, { lookup: vettedLookup, signal, headers: {
      'user-agent': 'Mozilla/5.0 (compatible; RemiRecipeImporter/1.0)', accept: 'text/html,application/xhtml+xml',
      'accept-language': 'en,ar;q=0.8', 'accept-encoding': 'gzip, deflate, br' } }, resolve);
    request.on('error', reject);
    request.end();
  });
}

/**
 * Fetches a public web page for recipe import. Only http(s) on the standard ports, never a private or local address
 * (checked on the connection itself, after every redirect), with a 10 second limit and a 3 MB cap on the decoded page.
 */
export async function fetchPublicPage(rawUrl: string): Promise<{ url: string; html: string }> {
  let url = rawUrl.trim();
  const signal = AbortSignal.timeout(10_000);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new DomainError('RECIPE_URL_INVALID', 'That is not a web link.', 422); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || (parsed.port && !['80', '443'].includes(parsed.port))) {
      throw new DomainError('RECIPE_URL_INVALID', 'Only ordinary http or https links can be imported.', 422);
    }
    // An address literal never reaches the lookup, so it is checked here.
    const literal = parsed.hostname.replace(/^\[|\]$/g, '');
    if (isIP(literal) && isPrivateAddress(literal)) throw new DomainError('RECIPE_URL_INVALID', 'That link points to a private network address.', 422);
    let response: IncomingMessage;
    try { response = await get(parsed, signal); } catch (error) {
      if (error instanceof PrivateAddressError) throw new DomainError('RECIPE_URL_INVALID', 'That link points to a private network address.', 422);
      if ((error as { code?: string }).code === 'ENOTFOUND') throw unreadable('the site could not be found');
      throw unreadable('the site did not answer');
    }
    const status = response.statusCode ?? 0, location = response.headers.location;
    if (status >= 300 && status < 400 && location) { response.destroy(); url = new URL(location, parsed).toString(); continue; }
    if (status < 200 || status >= 300) { response.destroy(); throw unreadable(`the site answered ${status}`); }
    if (!/html|xml/i.test(response.headers['content-type'] ?? 'text/html')) { response.destroy(); throw unreadable('it is not a web page'); }
    const encoding = response.headers['content-encoding'];
    const body = encoding === 'gzip' ? response.pipe(createGunzip()) : encoding === 'br' ? response.pipe(createBrotliDecompress())
      : encoding === 'deflate' ? response.pipe(createInflate()) : response;
    const chunks: Buffer[] = []; let size = 0;
    try {
      for await (const chunk of body as AsyncIterable<Buffer>) {
        size += chunk.length;
        if (size > MAX_BYTES) break; // recipe data sits in the <head>; a cut page still has it
        chunks.push(chunk);
      }
    } catch { if (!chunks.length) throw unreadable('the page could not be read'); }
    finally { response.destroy(); }
    if (!chunks.length) throw unreadable('the page was empty');
    return { url: parsed.toString(), html: Buffer.concat(chunks).toString('utf8') };
  }
  throw unreadable('it redirected too many times');
}
