// TedBus - MongoDB Atlas TLS diagnostic (read-only, no credentials or hardcoded hosts used)
// Run: node test-tls.js
require('dotenv').config({ path: __dirname + '/.env' });
const tls = require('tls');
const https = require('https');

function getConfiguredHosts() {
  if (process.env.ATLAS_TLS_HOSTS) {
    return process.env.ATLAS_TLS_HOSTS.split(',').map(h => h.trim()).filter(Boolean);
  }
  const uri = process.env.MONGODB_URI || '';
  const match = uri.match(/@([^/?]+)/);
  if (match && match[1]) {
    return match[1].split(',').map(h => h.split(':')[0].trim()).filter(Boolean);
  }
  return [];
}

const HOSTS = getConfiguredHosts();
const PORT = Number(process.env.MONGODB_TLS_PORT || 27017);

function envCheck() {
  console.log('=== Environment ===');
  console.log('Node:', process.version, '| OpenSSL:', process.versions.openssl);
  const vars = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
    'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS', 'NODE_OPTIONS', 'SSL_CERT_FILE'];
  for (const v of vars) {
    const val = process.env[v] || process.env[v.toLowerCase()];
    console.log(`${v}: ${val ? 'SET' : 'not set'}`);
  }
}

function publicIp(url) {
  return new Promise((resolve) => {
    https.get(url, { timeout: 8000 }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(d.trim()));
    }).on('error', (e) => resolve(`unavailable (${e.code || e.message})`))
      .on('timeout', function () { this.destroy(); resolve('unavailable (timeout)'); });
  });
}

function testTls(host, family) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = tls.connect({
      host, port: PORT, servername: host, family,
      timeout: 10000,
      // Certificate verification stays ON (default). Never disabled.
    });
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      resolve({
        ok: socket.authorized,
        detail: `${socket.getProtocol()} | ${socket.getCipher().name} | ` +
          `issuer: ${cert.issuer && cert.issuer.O} | remote: ${socket.remoteAddress} | ` +
          `${Date.now() - start}ms` +
          (socket.authorized ? '' : ` | NOT AUTHORIZED: ${socket.authorizationError}`),
      });
      socket.end();
    });
    socket.once('timeout', () => { socket.destroy(); resolve({ ok: false, detail: 'TIMEOUT' }); });
    socket.once('error', (e) => resolve({
      ok: false,
      detail: `${e.code || ''} ${e.message.split('\n')[0]}`.trim(),
    }));
  });
}

(async () => {
  envCheck();

  console.log('\n=== Public IP as seen from the internet ===');
  console.log('IPv4 (what Atlas Network Access must allow):', await publicIp('https://api.ipify.org'));
  console.log('IPv6 / preferred:', await publicIp('https://api64.ipify.org'));

  console.log(`\n=== TLS handshake to configured database hosts on port ${PORT} ===`);
  if (HOSTS.length === 0) {
    console.log('No database hosts configured in environment (MONGODB_URI / ATLAS_TLS_HOSTS).');
  }
  for (let i = 0; i < HOSTS.length; i++) {
    const host = HOSTS[i];
    for (const family of [4, 6]) {
      const r = await testTls(host, family);
      console.log(`[${r.ok ? 'OK  ' : 'FAIL'}] IPv${family} Host #${i + 1}\n       ${r.detail}`);
    }
  }
  console.log('\nDone. No credentials or connection strings were read or printed.');
})();
