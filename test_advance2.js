const fs = require('fs');
const env = fs.readFileSync('e:/App/crm/backend/.env', 'utf-8');
const dbUrl = env.split('\n').find(l => l.startsWith('SUPABASE_URL=')).split('=')[1].trim();
const dbKey = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_KEY=')).split('=')[1].trim();

async function run() {
  // Get all onboarding records, write to file to see full UUIDs
  const res = await fetch(`${dbUrl}/rest/v1/onboarding?select=id,status,company_id,company_name&order=updated_at.desc&limit=5`, {
    headers: { 'apikey': dbKey, 'Authorization': `Bearer ${dbKey}` }
  });
  const data = await res.json();
  fs.writeFileSync('onboarding_list.json', JSON.stringify(data, null, 2));
  console.log("Written to onboarding_list.json");
}
run();
