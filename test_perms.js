const fs = require('fs');
const env = fs.readFileSync('e:/App/crm/backend/.env', 'utf8');
const u = env.split('\n').find(l => l.startsWith('SUPABASE_URL=')).split('=')[1].trim();
const k = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_KEY=')).split('=')[1].trim();

async function run() {
  // Find user
  const ur = await fetch(`${u}/rest/v1/users?email=eq.francesco%40impiegando.com&select=id,email,role`, {
    headers: { 'apikey': k, 'Authorization': `Bearer ${k}` }
  });
  const users = await ur.json();
  console.log("User:", JSON.stringify(users));
  
  if (!users.length) { console.log("No user found!"); return; }
  const uid = users[0].id;
  
  // Get permissions
  const pr = await fetch(`${u}/rest/v1/user_company_permissions?user_id=eq.${uid}&select=company_id,role,is_default`, {
    headers: { 'apikey': k, 'Authorization': `Bearer ${k}` }
  });
  const perms = await pr.json();
  console.log("\nPermissions:", JSON.stringify(perms, null, 2));
  
  // Get company names
  const cids = perms.map(p => p.company_id);
  const cr = await fetch(`${u}/rest/v1/companies?id=in.(${cids.join(',')})&select=id,name`, {
    headers: { 'apikey': k, 'Authorization': `Bearer ${k}` }
  });
  const companies = await cr.json();
  console.log("\nCompanies:", JSON.stringify(companies, null, 2));
}
run();
