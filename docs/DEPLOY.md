# Deploying to Cloudflare

Every push to `main` runs the checks and then deploys the game to Cloudflare. Pull requests run the checks only. Until the two secrets below are added, the deploy step is skipped with a warning and nothing breaks.

This takes about 10 minutes, once.

## 1. Create a free Cloudflare account

1. Go to <https://dash.cloudflare.com/sign-up> and sign up (Google sign-in works).
2. You don't need a domain or a credit card. Skip anything about adding a website.
3. In the left menu, open **Compute (Workers)** → **Workers & Pages** once. Cloudflare asks you to pick a free `workers.dev` subdomain, for example `nachi`. The game will live at `https://colonizers.<your-subdomain>.workers.dev`.

## 2. Copy your Account ID

1. Still on **Workers & Pages**, look at the right side of the page (or open **Account home** and use the **⋯** menu next to the account name and choose **Copy account ID**).
2. Keep it somewhere for step 4. It is a 32-character string like `0123456789abcdef0123456789abcdef`. It is not secret on its own, but we store it as a secret anyway.

## 3. Create an API token

1. Click your profile icon (top right) → **My Profile** → **API Tokens**, or go straight to <https://dash.cloudflare.com/profile/api-tokens>.
2. Click **Create Token**.
3. Next to **Edit Cloudflare Workers**, click **Use template**.
4. Under **Account Resources**, choose **Include** and your account.
5. Under **Zone Resources**, choose **Include** → **All zones** (you have none, so this grants nothing extra).
6. Click **Continue to summary**, then **Create Token**.
7. Copy the token now. Cloudflare only shows it once. If you lose it, delete it and make a new one.

## 4. Add both values to GitHub as secrets

1. Open <https://github.com/unbiddenautonomy/colonizers/settings/secrets/actions>.
2. Click **New repository secret**.
   - Name: `CLOUDFLARE_API_TOKEN`
   - Secret: the token from step 3
3. Click **New repository secret** again.
   - Name: `CLOUDFLARE_ACCOUNT_ID`
   - Secret: the Account ID from step 2

Names must match exactly.

## 5. Deploy

Either merge any pull request into `main`, or open the **Actions** tab → **CI** → **Run workflow** on `main`.

When the run finishes, the **Deploy to Cloudflare** job shows the live address. Open it on two devices and press **Roll dice**: both should see the roll. Add `?room=anything` to the address to try a separate room.

## Running it on your own computer

You need Node 22 and pnpm (`corepack enable` installs pnpm).

```sh
pnpm install
pnpm build                       # build the web app once
pnpm --filter @colonizers/server dev   # game server and web app on http://localhost:8787
```

For live reloading of the web app while you work, run `pnpm dev` and open the address Vite prints (it forwards `/api` to the server).

## If something goes wrong

- **Deploy job warns that secrets are not set**: check the secret names in step 4.
- **Authentication error (code 10000)**: the token is wrong or lacks Workers permissions. Make a new one with the template in step 3.
- **"You need a workers.dev subdomain"**: do step 1.3.
