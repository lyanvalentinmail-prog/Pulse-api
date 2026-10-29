// Descarga URLs no confiables sin permitir acceso a redes privadas. La resolución
// se comprueba en el lookup que usa la conexión (evita DNS rebinding), y cada
// redirección se vuelve a validar antes de abrir la siguiente conexión.
const dns = require('dns');
const net = require('net');
const ipaddr = require('ipaddr.js');
const { Agent } = require('undici');

function isPublicAddress(input) {
  if (!ipaddr.isValid(input)) return false;
  let address = ipaddr.parse(input);
  if (address.kind() === 'ipv6' && address.isIPv4MappedAddress()) address = address.toIPv4Address();
  return address.range() === 'unicast';
}

function invalidUrl(message = 'La URL debe apuntar a un servidor público') {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function validatePublicUrl(input) {
  let url;
  try { url = new URL(input); } catch (_) { throw invalidUrl('URL remota inválida'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw invalidUrl();
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw invalidUrl();
  if (net.isIP(host) && !isPublicAddress(host)) throw invalidUrl();
  return url;
}

function publicLookup(hostname, options, callback) {
  dns.lookup(hostname, { family: options.family || 0, hints: options.hints || 0, all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err);
    if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) return callback(invalidUrl());
    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

const publicAgent = new Agent({ connect: { lookup: publicLookup } });
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

async function fetchPublic(input, options = {}) {
  let url = validatePublicUrl(input);
  let method = options.method || 'GET';
  let body = options.body;
  let headers = new Headers(options.headers || {});
  for (let hop = 0; hop <= 5; hop++) {
    let res;
    try { res = await fetch(url, { ...options, method, body, headers, redirect: 'manual', dispatcher: publicAgent }); }
    catch (e) {
      if (e.cause?.status === 400) throw e.cause;
      throw e;
    }
    if (!REDIRECTS.has(res.status) || !res.headers.get('location')) return res;
    const location = res.headers.get('location');
    res.body?.cancel().catch(() => {});
    if (hop === 5) throw new Error('Demasiadas redirecciones');
    const next = validatePublicUrl(new URL(location, url));
    if (next.origin !== url.origin) {
      headers = new Headers(headers);
      for (const name of ['authorization', 'cookie', 'api-key', 'proxy-authorization']) headers.delete(name);
    }
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method.toUpperCase() === 'POST')) {
      method = 'GET';
      body = undefined;
      headers.delete('content-type');
      headers.delete('content-length');
    }
    url = next;
  }
  throw new Error('Demasiadas redirecciones');
}

module.exports = { fetchPublic, validatePublicUrl, isPublicAddress, publicLookup };
