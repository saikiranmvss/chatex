# chatex — Deployment (GitHub Actions only)

**You do not SSH into the server for normal deploys.** Push to `main` and GitHub Actions will:

1. Build the app  
2. SSH to your server  
3. Run `create_server.sh` (installs nginx, MySQL, Node, DB, systemd — idempotent)  
4. Run `deploy.sh` (release, migrate, health check)

## What you need before the first deploy

### On DigitalOcean (one-time, in the control panel)

1. Ubuntu **24.04** droplet at `195.201.148.243` (or your IP).  
2. Linux user **`deploy`** with your **public** SSH key (`server_key.pub`) in `~deploy/.ssh/authorized_keys`.  
3. Nothing else — no manual `apt install`, no nginx, no MySQL.

If `deploy` cannot use `sudo` yet, either:

- Add in droplet **cloud-init** (paste when creating/rebuilding droplet):

```yaml
#cloud-config
users:
  - name: deploy
    groups: [sudo]
    shell: /bin/bash
    sudo: ["ALL=(ALL) NOPASSWD:ALL"]
    ssh_authorized_keys:
      - YOUR_PUBLIC_KEY_LINE_HERE
```

- **Or** set GitHub secret `SERVER_USER` = `root` for the **first** deploy only (workflow will create `deploy` + passwordless sudo).

### On GitHub (per repo)

Repository → **Settings** → **Secrets and variables** → **Actions**:

| Secret | Value |
|--------|--------|
| `SERVER_HOST` | `195.201.148.243` |
| `SERVER_USER` | `deploy` |
| `SSH_PRIVATE_KEY` | Full private key file (never commit to git) |
| `DB_PASSWORD` | MySQL password for user `chatex` |
| `ENV_FILE` | See below |

Optional: `APP_DOMAIN` / `SSL_EMAIL` when you have a domain later.

**`ENV_FILE` example:**

```env
NODE_ENV=production
PORT=5100
DATABASE_URL=mysql://chatex:YOUR_DB_PASSWORD@127.0.0.1:3306/chatex
SESSION_SECRET=use-openssl-rand-hex-32
LOG_LEVEL=info
```

`DB_PASSWORD` secret must match the password inside `DATABASE_URL`.

### Deploy

```bash
git push origin main
```

Or: **Actions** → **Deploy** → **Run workflow**.

### Live URL (no domain)

http://195.201.148.243/chatex/

## Order for all 4 apps

Run workflows for each repo (any order after secrets are set):

1. chatex  
2. lms  
3. ravyu  
4. timesheet  

First repo to deploy installs global packages (nginx, MySQL, PostgreSQL, Node). Others reuse that.

## Rollback (only if needed)

```bash
# optional manual SSH
sudo bash /var/www/chatex/scripts/rollback.sh
```
