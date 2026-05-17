#!/usr/bin/env bash
# Enable Let's Encrypt HTTPS when APP_DOMAIN (or APP_SUBDOMAIN + SERVER_BASE_DOMAIN) is set.
set -Eeuo pipefail

SCRIPTS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPTS_ROOT}/lib/common.sh"

[[ "$(id -u)" -eq 0 ]] || die "Run as root or via sudo"

resolve_app_name
resolve_deploy_mode

[[ "${DEPLOY_MODE}" == "domain" ]] || die "SSL requires domain mode (set APP_DOMAIN secret)"
[[ -n "${APP_DOMAIN}" ]] || die "APP_DOMAIN is empty"
[[ -n "${SSL_EMAIL:-}" ]] || die "Set SSL_EMAIL secret for Let's Encrypt"

if [[ -d "/etc/letsencrypt/live/${APP_DOMAIN}" ]]; then
  log "Certificate already exists for ${APP_DOMAIN}"
  certbot renew --nginx --quiet || true
else
  log "Requesting certificate for ${APP_DOMAIN}"
  certbot --nginx -d "${APP_DOMAIN}" --non-interactive --agree-tos -m "${SSL_EMAIL}" \
    --redirect
fi

nginx -t && systemctl reload nginx
log "SSL active for https://${APP_DOMAIN}"
