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

CERT_NAME="$(resolve_ssl_cert_name || true)"

if [[ -n "${CERT_NAME}" ]]; then
  log "Certificate exists for ${APP_DOMAIN} (${CERT_NAME})"
  certbot renew --cert-name "${CERT_NAME}" --quiet 2>/dev/null || true
else
  log "Requesting certificate for ${APP_DOMAIN} (cert-name: ${APP_NAME})"
  certbot --nginx -d "${APP_DOMAIN}" --cert-name "${APP_NAME}" --non-interactive --agree-tos \
    -m "${SSL_EMAIL}" --redirect
  CERT_NAME="$(resolve_ssl_cert_name || true)"
  [[ -n "${CERT_NAME}" ]] || die "Certbot did not create a certificate for ${APP_DOMAIN}"
fi

log "SSL certificate ready for https://${APP_DOMAIN} (${CERT_NAME})"
