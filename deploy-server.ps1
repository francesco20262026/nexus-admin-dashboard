# Deploy Nexus CRM su Windows Server 2019
# Esegui questi comandi nel PowerShell (come Amministratore) sul server
# STEP per STEP — non eseguire tutto insieme

# ============================================================
# STEP 1 — Controlla se Python è già installato
# ============================================================
python --version
# Se non trova Python, scarica e installa da:
# https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe
# ✅ Seleziona "Add Python to PATH" durante l'installazione

# ============================================================
# STEP 2 — Scarica NSSM per gestire FastAPI come servizio
# ============================================================
# Scarica da https://nssm.cc/release/nssm-2.24.zip
# Estrai nssm.exe in C:\tools\

# ============================================================
# STEP 3 — Crea le cartelle sul server
# ============================================================
New-Item -ItemType Directory -Force -Path "C:\nexus\frontend"
New-Item -ItemType Directory -Force -Path "C:\nexus\backend"

# ============================================================
# STEP 4 — Copia i file (da eseguire sulla tua macchina locale,
#           NON sul server — usa il tuo metodo preferito: RDP, SCP, ecc.)
# ============================================================
# FRONTEND: copia tutto il contenuto di:
#   C:\Users\fradmin\Documents\GitHub\nexus-admin-dashboard\
#   → in C:\nexus\frontend\ sul server
#
# BACKEND: copia il codice FastAPI → C:\nexus\backend\

# ============================================================
# STEP 5 — Installa le dipendenze Python del backend
# ============================================================
cd C:\nexus\backend
pip install -r requirements.txt
pip install "uvicorn[standard]"

# ============================================================
# STEP 6 — Crea il file .env del backend
# ============================================================
@"
SUPABASE_URL=https://nbobzshjajgbmprhgxio.supabase.co
SUPABASE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
SECRET_KEY=YOUR_JWT_SECRET_KEY_CAMBIA_QUESTO
"@ | Set-Content "C:\nexus\backend\.env" -Encoding UTF8

# ============================================================
# STEP 7 — Registra FastAPI come servizio Windows con NSSM
# ============================================================
$uvicorn = (Get-Command uvicorn).Source
C:\tools\nssm.exe install NexusAPI $uvicorn
C:\tools\nssm.exe set NexusAPI AppParameters "main:app --host 127.0.0.1 --port 8000"
C:\tools\nssm.exe set NexusAPI AppDirectory "C:\nexus\backend"
C:\tools\nssm.exe set NexusAPI AppStdout "C:\nexus\backend\logs\stdout.log"
C:\tools\nssm.exe set NexusAPI AppStderr "C:\nexus\backend\logs\stderr.log"
C:\tools\nssm.exe set NexusAPI Start SERVICE_AUTO_START
C:\tools\nssm.exe start NexusAPI

# Verifica che FastAPI risponda:
Start-Sleep -Seconds 3
Invoke-WebRequest http://127.0.0.1:8000/api/health

# ============================================================
# STEP 8 — Abilita IIS (se non già attivo)
# ============================================================
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole, IIS-WebServer -All

# Crea il sito IIS
Import-Module WebAdministration
New-Website -Name "NexusCRM" -Port 80 -PhysicalPath "C:\nexus\frontend" -Force

# ============================================================
# STEP 9 — Installa e configura cloudflared
# ============================================================
# 1. Scarica cloudflared-windows-amd64.msi da:
#    https://github.com/cloudflare/cloudflared/releases/latest
# 2. Installa il .msi

cloudflared tunnel login
cloudflared tunnel create nexus-crm
# Salva il TUNNEL-ID mostrato

# Aggiorna cloudflared-config.yml con il tuo TUNNEL-ID e dominio
# poi copia in: C:\Users\Administrator\.cloudflared\config.yml

cloudflared tunnel route dns nexus-crm crm.delocanova.com
cloudflared tunnel route dns nexus-crm api.delocanova.com

cloudflared service install
Start-Service cloudflared

# ============================================================
# STEP 10 — Verifica finale
# ============================================================
# FastAPI locale:
Invoke-WebRequest http://127.0.0.1:8000/api/health

# IIS locale:
Invoke-WebRequest http://localhost

# Tunnel status:
cloudflared tunnel info nexus-crm

# Da browser esterno: apri https://tuodominio.com
