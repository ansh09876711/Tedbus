const dns = require('dns');

async function testDNS() {
  console.log("=== Node.js DNS Diagnostics ===");
  console.log("Current Node.js DNS servers:", dns.getServers());

  const srvDomain = "_mongodb._tcp.tedbus.uigd8cz.mongodb.net";
  console.log(`\n1. Testing default Node.js DNS resolver on: ${srvDomain}...`);

  try {
    const addresses = await dns.promises.resolveSrv(srvDomain);
    console.log("SUCCESS! Default resolver returned SRV records:");
    console.dir(addresses);
  } catch (err) {
    console.log(`FAILED with default resolver: ${err.code} (${err.message})`);
  }

  console.log("\n2. Switching Node.js DNS to public resolvers (8.8.8.8, 1.1.1.1)...");
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  console.log("Updated Node.js DNS servers:", dns.getServers());

  try {
    const addresses = await dns.promises.resolveSrv(srvDomain);
    console.log("SUCCESS! Public resolver returned SRV records:");
    console.dir(addresses);

    // Also fetch TXT record (contains replicaSet and authSource options for mongodb+srv)
    try {
      const txtRecords = await dns.promises.resolveTxt("tedbus.uigd8cz.mongodb.net");
      console.log("\nAtlas TXT records (replicaSet options):", txtRecords.map(r => r.join('')));
    } catch (txtErr) {
      console.log("Could not fetch TXT record:", txtErr.message);
    }
  } catch (err) {
    console.log(`FAILED with public resolver: ${err.code} (${err.message})`);
  }
}

testDNS();
