require('dotenv').config({ path: __dirname + '/.env' });
const dns = require('dns');

function extractClusterHostFromEnv() {
  if (process.env.ATLAS_CLUSTER_HOST) {
    return process.env.ATLAS_CLUSTER_HOST.trim();
  }
  const uri = process.env.MONGODB_URI || '';
  // Safely extract only the hostname portion after '@' without logging or retaining credentials
  const match = uri.match(/@([^/?]+)/);
  if (match && match[1]) {
    return match[1].split(',')[0].split(':')[0].trim();
  }
  return '';
}

async function testDNS() {
  console.log("=== Node.js DNS Diagnostics ===");
  console.log("Current Node.js DNS servers:", dns.getServers());

  const clusterHost = extractClusterHostFromEnv();
  if (!clusterHost) {
    console.log("No MONGODB_URI or ATLAS_CLUSTER_HOST configured in environment. Skipping SRV lookup.");
    return;
  }

  const srvDomain = `_mongodb._tcp.${clusterHost}`;
  console.log("\n1. Testing default Node.js DNS resolver on configured cluster SRV record...");

  try {
    const addresses = await dns.promises.resolveSrv(srvDomain);
    console.log(`SUCCESS! Default resolver returned ${addresses.length} SRV record(s).`);
  } catch (err) {
    console.log(`FAILED with default resolver: ${err.code} (${err.message})`);
  }

  console.log("\n2. Switching Node.js DNS to public resolvers (8.8.8.8, 1.1.1.1)...");
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  console.log("Updated Node.js DNS servers:", dns.getServers());

  try {
    const addresses = await dns.promises.resolveSrv(srvDomain);
    console.log(`SUCCESS! Public resolver returned ${addresses.length} SRV record(s).`);

    try {
      const txtRecords = await dns.promises.resolveTxt(clusterHost);
      console.log(`TXT record count: ${txtRecords.length}`);
    } catch (txtErr) {
      console.log("Could not fetch TXT record:", txtErr.message);
    }
  } catch (err) {
    console.log(`FAILED with public resolver: ${err.code} (${err.message})`);
  }
}

testDNS();
