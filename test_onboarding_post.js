const fs = require('fs');

async function testApi() {
  const env = fs.readFileSync('e:/App/crm/backend/.env', 'utf8');
  const u = env.split('\n').find(l => l.startsWith('SUPABASE_URL=')).split('=')[1].trim();
  const k = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_KEY=')).split('=')[1].trim();

  // Test payload
  const payload = {
    company_name: "Test IT Services Assignment",
    email: "test.itservices@example.com",
    company_id: "15a52e6b-36a1-4b00-9496-6a277e9492ea", // IT Services
    priority: "medium",
    status: "new",
    steps_total: 10,
    steps_completed: 0
  };

  try {
    const res = await fetch("http://127.0.0.1:8000/api/v1/onboarding/", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Mock the JWT using a service token or bypass if needed, wait, we don't have the user's JWT. 
        // We'd have to sign in or get the user's JWT from somewhere, or bypass auth ...
      },
      body: JSON.stringify(payload)
    });

    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Response:", JSON.stringify(data, null, 2));

  } catch (e) {
    console.error("Error", e);
  }
}
testApi();
