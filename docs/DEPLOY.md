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

You don't need to create the `colonizers` Worker yourself. The first deploy creates it.

The quickest way is this link, which opens the form already filled in with **Workers Scripts: Edit** and **Account Settings: Read**:
<https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%5D&name=colonizers-github>
If it shows those two permissions, jump to step 6. Otherwise, do it by hand:

1. Click your profile icon (top right) → **My Profile** → **API Tokens**.
2. Click **Create Token**.
3. If you see an **Edit Cloudflare Workers** template, use it, pick your account, and skip to step 6. Otherwise choose **Create Custom Token** (or "start from scratch").
4. Give it a name, for example `colonizers-github`.
5. Add this permission. Depending on the page version it is either a row of three dropdowns or a policy with type **Account**:
   - **Account** → **Workers Scripts** → **Edit**
   - Limit it to your account (under **Account Resources**, or the policy's resource rule).
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

## 6. Optional: sign-in with Google and account emails

The site works without these. Without Google keys, the Google button is hidden. Without an email key, sign-up still works, but confirmation and password-reset emails are not sent.

**Google sign-in**

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project (any name).
2. Go to **APIs & Services → OAuth consent screen**, choose **External**, fill in the app name and your email, and save. Add your friends as test users, or publish the app.
3. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**. Choose **Web application**.
4. Under **Authorized redirect URIs**, add `https://YOUR-SITE/api/auth/google/callback` (your live address from step 5).
5. Copy the client ID and client secret.

**Emails**

1. Make a free account at [resend.com](https://resend.com) and create an API key.
2. To send from your own address, add and verify your domain there. Otherwise emails come from Resend's test address, which only delivers to your own Resend email.

**Add them to the Worker**

In the Cloudflare dashboard, open **Workers & Pages → colonizers → Settings → Variables and Secrets** and add these as secrets:

| Name                   | Value                                          |
| ---------------------- | ---------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | Client ID from Google                          |
| `GOOGLE_CLIENT_SECRET` | Client secret from Google                      |
| `RESEND_API_KEY`       | API key from Resend                            |
| `EMAIL_FROM`           | For example `Colonizers <play@yourdomain.com>` |
| `ADMIN_EMAILS`         | Optional. Comma-separated emails of admins     |

They take effect straight away; no redeploy is needed.

## 7. Optional: "your turn" notifications

Players can get a notification on their phone or computer when it's their
move, even with the app closed. This needs a key pair that only you have.

1. On your computer, in the project folder, run
   `pnpm --filter @colonizers/server vapid`. It prints two lines.
2. In Cloudflare, open the Worker's **Settings → Variables and Secrets** and
   add them as secrets: `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.
3. Optionally add `VAPID_SUBJECT`: a `mailto:` address or web page where push
   services can reach you if something goes wrong.

Players then tap **Notify me on my turn** in their profile or in a game room.
On iPhone this works once the app is added to the home screen (Share → Add to
Home Screen), on iOS 16.4 or later.

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
