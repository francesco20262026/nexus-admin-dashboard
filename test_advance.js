const fs = require('fs');
const env = fs.readFileSync('e:/App/crm/backend/.env', 'utf-8');
const dbUrl = env.split('\n').find(l => l.startsWith('SUPABASE_URL=')).split('=')[1].trim();
const dbKey = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_KEY=')).split('=')[1].trim();

async function run() {
  const oid = 'c4fcaec3-0065-419a-9d45-5185b5a8d81a'; // Alessia SRL
  
  // Check what company_id is on the onboarding record
  const r1 = await fetch(`${dbUrl}/rest/v1/onboarding?id=eq.${oid}&select=id,status,company_id,company_name`, {
    headers: { 'apikey': dbKey, 'Authorization': `Bearer ${dbKey}` }
  });
  const d1 = await r1.json();
  console.log("Onboarding company_id:", d1[0]?.company_id);
  console.log("Onboarding status:", d1[0]?.status);
  
  // Simulate what automation.py does: query with company_id filter
  const company_id = d1[0]?.company_id;
  const r2 = await fetch(`${dbUrl}/rest/v1/onboarding?id=eq.${oid}&company_id=eq.${company_id}&select=status`, {
    headers: { 'apikey': dbKey, 'Authorization': `Bearer ${dbKey}` }
  });
  const d2 = await r2.json();
  console.log("automation.py query result (with company_id):", d2.length > 0 ? "FOUND" : "NOT FOUND");
  
  // Try updating to quote_draft directly
  console.log("\nTrying direct update to quote_draft...");
  const r3 = await fetch(`${dbUrl}/rest/v1/onboarding?id=eq.${oid}`, {
    method: 'PATCH',
    headers: { 'apikey': dbKey, 'Authorization': `Bearer ${dbKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify({ status: 'quote_draft' })
  });
  console.log("Update status:", r3.status);
  
  // Verify
  const r4 = await fetch(`${dbUrl}/rest/v1/onboarding?id=eq.${oid}&select=status`, {
    headers: { 'apikey': dbKey, 'Authorization': `Bearer ${dbKey}` }
  });
  const d4 = await r4.json();
  console.log("New status:", d4[0]?.status);
}
run();
