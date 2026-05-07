# 🚀 Deploy Speculative Alpha fuori da Emergent

Guida step-by-step per pubblicare la dashboard su:
- **Frontend**: Vercel (gratis)
- **Backend**: Render (gratis, upgrade 7$/mese consigliato)
- **Database**: MongoDB Atlas (gratis, 512 MB)
- **AI**: Google Gemini API (gratis, 1500 richieste/giorno)
- **Dominio**: `speculativealpha.com` (su register.it)

Totale stimato: **0 €/mese** (free) → **~6 €/mese** (con backend always-on).

---

## STEP 1 — Salva il codice su GitHub

Clicca sul pulsante **"Save to GitHub"** in alto nella chat di Emergent.
Scegli un nome repo (es. `speculative-alpha`). Verifica che il push sia andato a buon fine andando su https://github.com/TUO_USER/speculative-alpha

---

## STEP 2 — Crea il database MongoDB Atlas (5 minuti)

1. Vai su https://www.mongodb.com/atlas/register e crea un account gratuito.
2. Crea un nuovo **Cluster** → scegli **M0 Free** → regione **Frankfurt (eu-central-1)**.
3. **Database Access** (menù sinistra) → *Add New Database User*:
   - Username: `specalpha`
   - Password: clicca *Autogenerate Secure Password* e **salvala** subito
   - Built-in role: *Read and write to any database*
4. **Network Access** → *Add IP Address* → **Allow Access from Anywhere** (`0.0.0.0/0`).
5. **Database** → *Connect* → *Drivers* → copia la connection string.
   Sarà tipo:
   ```
   mongodb+srv://specalpha:<PASSWORD>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   Sostituisci `<PASSWORD>` con la password vera. **Salva questa stringa**: è la tua `MONGO_URL`.

---

## STEP 3 — Ottieni la chiave Gemini API (gratis)

1. Vai su https://aistudio.google.com/apikey
2. Login con Google → *Create API key* → *Create API key in new project*.
3. Copia la chiave (inizia con `AIza...`). **Salvala**: è la tua `GEMINI_API_KEY`.

> Free tier: 15 richieste/min, 1500/giorno. Per Speculative Alpha è ampiamente sufficiente.

---

## STEP 4 — Deploy del Backend su Render

1. Vai su https://dashboard.render.com/register e iscriviti **con GitHub**.
2. Clicca **New +** → **Blueprint**.
3. Seleziona il repository `speculative-alpha`.
4. Render legge automaticamente il file `render.yaml` e propone di creare il servizio.
5. **Apply** → ti chiederà di compilare le variabili marcate `sync: false`:
   - `MONGO_URL` → la connection string di MongoDB Atlas (Step 2)
   - `GEMINI_API_KEY` → la chiave Gemini (Step 3)
   - `CORS_ORIGINS` → per ora metti `*` (lo restringeremo dopo aver collegato il dominio)
6. Clicca **Create Resources**.
7. Aspetta 4-6 minuti la prima build (vedrai i log scorrere).
8. Quando lo stato diventa **Live (verde)**, copia l'URL del servizio (es. `https://speculative-alpha-backend.onrender.com`).
9. Verifica che funzioni aprendo: `https://speculative-alpha-backend.onrender.com/api/health` → deve rispondere `{"status": "ok"}` (o simile).

> ⚠️ Sul piano free, dopo 15 minuti senza richieste il servizio va in sleep. La prima richiesta successiva impiega ~30-50 secondi a svegliarlo. Se ti dà fastidio, su Render: *Settings → Instance Type → Starter (7$/mese)*.

---

## STEP 5 — Deploy del Frontend su Vercel

1. Vai su https://vercel.com/signup e iscriviti **con GitHub**.
2. Clicca **Add New...** → **Project**.
3. Seleziona il repository `speculative-alpha` → **Import**.
4. Configura:
   - **Framework Preset**: *Other* (Vercel rileva automaticamente da `vercel.json`)
   - **Root Directory**: lascia vuoto (root)
5. **Environment Variables** → aggiungi:
   - Key: `REACT_APP_BACKEND_URL`
   - Value: l'URL del backend Render (es. `https://speculative-alpha-backend.onrender.com`)
6. Clicca **Deploy**. In 3-4 minuti hai un URL tipo `speculative-alpha.vercel.app`.
7. Apri l'URL → la dashboard deve caricarsi e mostrare i dati COT.

---

## STEP 6 — Collega il dominio `speculativealpha.com` (register.it)

### 6A — Aggiungi il dominio su Vercel
1. Su Vercel → progetto → **Settings → Domains**.
2. Aggiungi `speculativealpha.com` → Vercel ti dirà di puntare il record **A** a `76.76.21.21` (o di usare CNAME per il sottodominio www).
3. Aggiungi anche `www.speculativealpha.com` → Vercel ti dirà di usare CNAME `cname.vercel-dns.com`.

### 6B — Configura DNS su register.it
1. Login su https://www.register.it → *I miei domini* → seleziona `speculativealpha.com` → *Gestisci* → *Gestione DNS* (o *Editor DNS*).
2. **Rimuovi** eventuali record A o CNAME esistenti su `@` e `www` che puntano a Emergent o altrove.
3. **Aggiungi** questi record:

   | Tipo  | Host | Valore                  | TTL  |
   |-------|------|-------------------------|------|
   | A     | @    | `76.76.21.21`           | 3600 |
   | CNAME | www  | `cname.vercel-dns.com.` | 3600 |

4. Salva. La propagazione DNS può richiedere da 10 minuti a 24 ore.
5. Torna su Vercel → *Settings → Domains* → quando vedi il pallino verde su entrambi i domini, sei online.

### 6C — Restringi CORS sul backend
1. Su Render → servizio backend → **Environment** → modifica `CORS_ORIGINS`:
   ```
   https://speculativealpha.com,https://www.speculativealpha.com
   ```
2. Salva → Render fa il redeploy automatico.

---

## STEP 7 — Mantieni il backend "warm" e i dati sempre freschi

Su Render free tier il backend va in sleep dopo 15 min. Con un cron esterno gratuito eviti il cold-start E forzi il refresh dei dati ogni X minuti.

### Configurazione cron-job.org (gratis)
1. Vai su https://cron-job.org/en/signup → registrati gratis
2. **Cronjobs** → **CREATE CRONJOB**
3. Configura:
   - **Title**: `Speculative Alpha — keep warm`
   - **URL**: `https://speculative-alpha-backend.onrender.com/api/cron/warm`
   - **Schedule**: ogni **10 minuti** (per mantenere il backend sveglio)
   - **Notify on failure**: ON
4. Salva. Il backend riceverà un ping ogni 10 min e:
   - Non andrà mai in sleep
   - Il pre-warm interno aggiorna gli asset stale automaticamente
   - I nuovi report COT del sabato vengono prelevati appena disponibili

### Schedule alternativi consigliati
- **Solo refresh weekly** (se accetti cold-start): un cron job singolo ogni **sabato alle 23:00 UTC**
- **Risparmio aggressivo**: ogni **30 minuti** (ancora abbastanza per evitare sleep su Render free)

### Endpoint disponibili
- `GET/POST /api/cron/warm` → triggera pre-warm asincrono di tutti gli asset
- `POST /api/cot/refresh` → svuota cache snapshot (manuale, non cancella la cronologia)
- `GET /api/health` → health check

---

## STEP 8 — Verifica finale

Apri https://speculativealpha.com in incognito:
- ✅ La dashboard carica
- ✅ Le card asset mostrano i dati COT
- ✅ Cliccando un asset vedi il modal con grafici e Macro Intelligence (testo Gemini)
- ✅ Toggle IT/EN funziona

Se qualcosa non va, controlla:
- **Render → Logs** del backend
- **Vercel → Deployments → View Function Logs**
- Console del browser (F12) per errori CORS o 404 sull'API

---

## 🔄 Aggiornamenti futuri

**Per pubblicare modifiche**: ogni `git push` sul branch principale fa redeploy automatico sia su Vercel sia su Render. Zero configurazione.

**Per migrare i dati COT esistenti** (opzionale — la cache si rigenera da sola):
```bash
mongodump --uri="mongodb://localhost:27017" --db=test_database --out=./dump
mongorestore --uri="$MONGO_URL" --nsFrom="test_database.*" --nsTo="speculativealpha.*" ./dump
```

---

## 📞 Costi finali

| Servizio | Piano | Costo/mese |
|----------|-------|-----------|
| Vercel (frontend) | Hobby | **0 €** |
| Render (backend) | Free | **0 €** (con sleep dopo 15 min) |
| Render (backend) | Starter | ~6,40 € (always-on) |
| MongoDB Atlas | M0 Free | **0 €** |
| Gemini API | Free tier | **0 €** (1500 req/giorno) |
| Dominio register.it | annuale | già pagato |

**Setup gratis: 0 €/mese.** Quando vorrai eliminare il cold-start, passa il backend a Starter su Render (6-7 €/mese).
