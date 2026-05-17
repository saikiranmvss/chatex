# Production environment for ${APP_NAME}
# Copy to /var/www/${APP_NAME}/shared/.env or set GitHub secret ENV_FILE

NODE_ENV=production
PORT=${APP_PORT}
LOG_LEVEL=info

# Database (MySQL)
DATABASE_URL=mysql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:3306/${DB_NAME}

# Auth
SESSION_SECRET=CHANGE_ME_MIN_32_CHARS

# Frontend build (CI only — baked into static assets)
# BASE_PATH=/chatex/
