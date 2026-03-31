# Sync da GitHub

## What & Why
Fare il pull dei file aggiornati dal repository GitHub `https://github.com/francesco20262026/nexus-admin-dashboard` nel branch master, per allineare il progetto Replit alle ultime modifiche del developer.

## Done looks like
- Tutti i file aggiornati su GitHub sono presenti nel progetto
- Il server si avvia correttamente dopo il pull
- Il login, la dashboard admin e client mostrano la versione aggiornata

## Out of scope
- Modifiche grafiche aggiuntive
- Nuove funzionalità

## Tasks
1. **Git pull da origin/master** — Eseguire `git pull origin master` (o il branch corretto) per portare tutte le modifiche recenti del developer nel progetto Replit.
2. **Verifica avvio** — Assicurarsi che `python server.py` si avvii senza errori dopo il pull e che le pagine principali (login, admin_dash, client_dash) siano servite correttamente.

## Relevant files
- `server.py`
- `backend/config.py`
- `backend/database.py`
- `assets/js/api.js`
