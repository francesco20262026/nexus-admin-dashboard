const fs = require('fs');
const env = fs.readFileSync('e:/App/crm/backend/.env', 'utf-8');
const dbUrl = env.split('\n').find(l => l.startsWith('SUPABASE_URL=')).split('=')[1].trim();
const dbKey = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_KEY=')).split('=')[1].trim();

async function run() {
  const cid = 'f2a518f0-54ff-47af-a6b7-ffb484145025';
  console.log("Checking invoices for client:", cid);
  
  const res = await fetch(`${dbUrl}/rest/v1/invoices?client_id=eq.${cid}`, {
    headers: { 'apikey': dbKey, 'Authorization': `Bearer ${dbKey}` }
  });
  
  const data = await res.json();
  console.log("Found invoices:", data.length);
  if (data.length > 0) {
      console.log("First invoice:", JSON.stringify(data[0], null, 2));
  }
}

run();
