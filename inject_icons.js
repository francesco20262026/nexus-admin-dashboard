const fs = require('fs');

function injectIcons(filePath) {
  if (!fs.existsSync(filePath)) return;
  let html = fs.readFileSync(filePath, 'utf8');

  const replacements = [
    { id: '#sec-anagrafica', color: 'ic-blue' },
    { id: '#sec-contatti', color: 'ic-green' },
    { id: '#sec-servizi', color: 'ic-orange' },
    { id: '#sec-preventivi', color: 'ic-yellow' },
    { id: '#sec-contratti', color: 'ic-purple' },
    { id: '#sec-documenti', color: 'ic-cyan' },
    { id: '#sec-fatture', color: 'ic-teal' },
    { id: '#sec-storico', color: 'ic-gray' }
  ];

  for (const rep of replacements) {
    // We look for: <a ... href="#sec-NAME" ...> [whitespace] <svg ...</svg>
    // We already know they look like:
    // <a href="#sec-anagrafica" class="mac-nav-item active" ...>
    //   <svg ...</svg>
    // We want to wrap the <svg> in <div class="mac-icon-box color">
    
    // First, let's check if it's already wrapped to avoid double wrapping
    const rxCheck = new RegExp(`href="${rep.id}"[^>]*>[\\s\\S]*?<div class="mac-icon-box`);
    if (rxCheck.test(html)) {
      console.log(`${rep.id} already wrapped in ${filePath}`);
      continue;
    }

    const rx = new RegExp(`(<a[^>]*href="${rep.id}"[^>]*>\\s*)(<svg[\\s\\S]*?<\\/svg>)`);
    html = html.replace(rx, `$1<div class="mac-icon-box ${rep.color}">$2</div>`);
  }

  fs.writeFileSync(filePath, html);
  console.log(`Processed ${filePath}`);
}

injectIcons('e:/App/crm/admin_client_detail.html');
injectIcons('e:/App/crm/admin_onboarding_detail.html');
