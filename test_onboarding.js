const fs = require('fs');
const env = fs.readFileSync('e:/App/crm/backend/.env', 'utf-8');
const dbUrl = env.split('\n').find(l => l.startsWith('SUPABASE_URL=')).split('=')[1].trim();
const dbKey = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_KEY=')).split('=')[1].trim();

async function run() {
  const oid = 'a0f344cd-141c-4411-9d81-f60b1339dc8d';
  console.log("Checking onboarding:", oid);
  
  const res = await fetch(`${dbUrl}/rest/v1/onboarding?id=eq.${oid}`, {
    headers: { 'apikey': dbKey, 'Authorization': `Bearer ${dbKey}` }
  });
  
  const data = await res.json();
  console.log("Exists in DB?", data.length > 0 ? "YES" : "NO");
}

run();
