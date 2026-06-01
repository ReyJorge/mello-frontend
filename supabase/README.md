# Setup nového Supabase projektu pro Mello

Tento návod popisuje, jak napojit Mello frontend na **nový** Supabase projekt.

## 1. Vytvořte projekt v Supabase

1. Přihlaste se na [supabase.com](https://supabase.com)
2. **New project** → zvolte název, heslo k DB a region (EU doporučeno)
3. Po vytvoření otevřete **Project Settings → API**

Zapište si:

| Hodnota | Kam v projektu |
|---------|----------------|
| **Project URL** | `VITE_SUPABASE_URL` |
| **anon public** klíč | `VITE_SUPABASE_ANON_KEY` |

> **Nikdy** nepoužívejte `service_role` klíč ve frontendu.

## 2. Nastavte env proměnné

V kořeni `mello-frontend/` vytvořte nebo upravte soubor `.env`:

```env
VITE_SUPABASE_URL=https://VASE-REF.supabase.co
VITE_SUPABASE_ANON_KEY=vase-anon-klic

# Volitelné – URL backendu s OpenAI (chat API)
# Prázdné = /api (Vite proxy ve vývoji)
VITE_API_URL=
```

Zkopírujte šablonu:

```bash
cp .env.example .env
```

Po změně `.env` restartujte dev server (`npm run dev`).

## 3. Spusťte SQL schéma

1. Supabase Dashboard → **SQL Editor**
2. Otevřete soubor [`full_setup.sql`](./full_setup.sql)
3. Vložte celý obsah a klikněte **Run**

Skript vytvoří:

| Tabulka | Účel |
|---------|------|
| `profiles` | Jméno, hlas, jazyk po onboarding |
| `chat_messages` | Historie chatu (posledních 50 zpráv) |
| `skills` | Tržiště dovedností |
| `mello_memory` | Rodinný deník / vzpomínky |

Včetně **RLS politik**, **indexů** a triggeru pro automatický profil po registraci.

## 4. Nastavte Auth

V Supabase Dashboard → **Authentication → Providers**:

- **Email** – zapnuto (pro `/signin`)
- **Confirm email** – dle vašeho MVP (pro testy lze vypnout)
- **Phone** – volitelné (route `/phone` existuje, ale není v hlavním menu)

**Site URL** (Authentication → URL Configuration):

- Vývoj: `http://localhost:5173`
- Produkce: URL vaší nasazené aplikace

**Redirect URLs** – přidejte stejné URL + `http://127.0.0.1:5173`

## 5. Ověření auth flow

1. `npm run dev` (+ běžící backend pro chat – viz hlavní README)
2. Otevřete `/signin` → registrace nebo přihlášení
3. Po prvním loginu → `/onboarding` (vyplnění jména)
4. Po uložení profilu → `/chat`
5. Při dalším loginu (profil existuje) → rovnou `/chat`

## 6. Ověření historie chatu

1. Přihlaste se a otevřete `/chat`
2. Napište zprávu – backend musí běžet (`server/`, port 5001 na Macu kvůli AirPlay)
3. Obnovte stránku – zprávy by se měly načíst z `chat_messages`
4. V Supabase → **Table Editor → chat_messages** – ověřte nové řádky

Pokud tabulka neexistuje nebo RLS selže, aplikace **nespadne** – použije localStorage.

## 7. Build

```bash
npm run build
```

## Řešení problémů

| Problém | Řešení |
|---------|--------|
| „Supabase URL nebo klíč chybí“ | Zkontrolujte `.env` a restart dev serveru |
| Profil se neuloží | Spusťte `full_setup.sql`, ověřte RLS |
| Chat se neukládá do DB | Přihlášení + tabulka `chat_messages` + RLS |
| Registrace vyžaduje potvrzení e-mailu | Supabase Auth → vypněte confirm nebo potvrďte e-mail |

## Soubory v projektu

- `src/utils/supabaseClient.ts` – jediné místo vytvoření Supabase klienta (čte env)
- `src/utils/chatPersistence.js` – načítání/ukládání `chat_messages`
- `src/utils/authRedirect.js` – redirect po loginu podle `profiles`
