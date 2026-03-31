while ((netstat -ano | findstr ':8000 ')) { Start-Sleep -Seconds 3 }
Add-Type -AssemblyName PresentationCore,PresentationFramework
[System.Windows.MessageBox]::Show('Il blocco Cloudflare è svanito. La porta 8000 è VERGINE! Lancia start-backend.bat ORA.', 'CRM REBOOT ALGORITHM', 'OK', 'Information')
while (-not (netstat -ano | findstr ':8000 ' | findstr 'LISTENING')) { Start-Sleep -Seconds 3 }
Start-Service -Name 'cloudflared'
[System.Windows.MessageBox]::Show('Backend intercettato con successo. Cloudflared è stato riavviato automaticamente. Il CRM E ONLINE E VISIBILE SU INTERNET!', 'CRM REBOOT ALGORITHM', 'OK', 'Information')
