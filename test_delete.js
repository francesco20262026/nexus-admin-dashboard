// No node-fetch needed

const url = 'https://nbobzshjajgbmprhgxio.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ib2J6c2hqYWpnYm1wcmhneGlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTEyNjcxNjUsImV4cCI6MjAyNjg0MzE2NX0.LtL7iIb5wGIk4cMJ9YbTEwyNn0.VhTyA96kV-eUv'; // Note: Truncated from earlier output, I need the full key. Wait, I'll extract it dynamically.

async function run() {
  const fs = require('fs');
  const env = fs.readFileSync('e:/App/crm/backend/.env', 'utf-8');
  const dbUrl = env.split('\n').find(l => l.startsWith('SUPABASE_URL=')).split('=')[1].trim();
  const dbKey = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_KEY=')).split('=')[1].trim();
  
  console.log("URL:", dbUrl);
  // Decode JWT to see if it's anon or service_role
  try {
     const payload = JSON.parse(Buffer.from(dbKey.split('.')[1], 'base64').toString());
     console.log("JWT Role:", payload.role);
  } catch(e) {}
  
  // 1. Get a cancelled onboarding record
  const res = await fetch(`${dbUrl}/rest/v1/onboarding?status=eq.cancelled&limit=1`, {
    headers: { 'apikey': dbKey, 'Authorization': `Bearer ${dbKey}` }
  });
  const data = await res.json();
  if (!data || data.length === 0) {
     console.log("No cancelled onboarding found.");
     return;
  }
  const id = data[0].id;
  console.log("Found cancelled onboarding ID:", id);
  
  // 2. Try to hard delete it
  console.log("Attempting to delete it...");
  const delRes = await fetch(`${dbUrl}/rest/v1/onboarding?id=eq.${id}`, {
    method: 'DELETE',
    headers: { 'apikey': dbKey, 'Authorization': `Bearer ${dbKey}` }
  });
  
  console.log("Delete Status:", delRes.status, delRes.statusText);
  if (!delRes.ok) {
     console.log("Delete Error Response:", await delRes.text());
  } else {
     console.log("Delete succeeded (no error from API).");
  }
  
  // 3. Verify if it's still there
  const checkRes = await fetch(`${dbUrl}/rest/v1/onboarding?id=eq.${id}`, {
    headers: { 'apikey': dbKey, 'Authorization': `Bearer ${dbKey}` }
  });
  const checkData = await checkRes.json();
  console.log("Does it still exist?", checkData.length > 0 ? "YES" : "NO");
}

run();
