const fs = require('fs');
const env = fs.readFileSync('e:/App/crm/backend/.env', 'utf-8');
const dbUrl = env.split('\n').find(l => l.startsWith('SUPABASE_URL=')).split('=')[1].trim();
const dbKey = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_KEY=')).split('=')[1].trim();

async function run() {
  // Get all onboarding records and their statuses
  const res = await fetch(`${dbUrl}/rest/v1/onboarding?select=id,status,company_name,company_id&order=updated_at.desc&limit=5`, {
    headers: { 'apikey': dbKey, 'Authorization': `Bearer ${dbKey}` }
  });
  const data = await res.json();
  console.log("Recent onboarding records:");
  data.forEach(r => console.log(`  ${r.company_name}: status="${r.status}" (id=${r.id})`));
}
run();
