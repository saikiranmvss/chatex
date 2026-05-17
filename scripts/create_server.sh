#!/usr/bin/env bash
# Idempotent server provisioning — run locally, or automatically from GitHub Actions.
# Requires root or passwordless sudo (deploy user on DigitalOcean).
set -Eeuo pipefail

SCRIPTS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPTS_ROOT}/lib/common.sh"

require_root_or_sudo

resolve_app_name
resolve_deploy_mode

provision_global() {
  if [[ -f "${PROVISION_MARKER}" ]]; then
    log "Global provisioning already done (${PROVISION_MARKER})"
    return 0
  fi
  log "=== Global server provisioning ==="
  apt-get update -qq
  apt-get install -y -qq curl git nginx ufw fail2ban certbot python3-certbot-nginx \
    mysql-server postgresql postgresql-contrib gettext-base \
    build-essential sudo

  # Deploy user (created by GitHub Actions / DigitalOcean cloud-init if missing)
  if ! id "${DEPLOY_USER}" &>/dev/null; then
    useradd -m -s /bin/bash "${DEPLOY_USER}"
    usermod -aG www-data "${DEPLOY_USER}"
    log "Created user ${DEPLOY_USER}"
  fi
  usermod -aG sudo "${DEPLOY_USER}" 2>/dev/null || true
  if [[ ! -f /etc/sudoers.d/cloudteor-deploy ]]; then
    printf '%s ALL=(ALL) NOPASSWD:ALL\n' "${DEPLOY_USER}" > /etc/sudoers.d/cloudteor-deploy
    chmod 440 /etc/sudoers.d/cloudteor-deploy
    log "Passwordless sudo enabled for ${DEPLOY_USER}"
  fi

  # nvm + Node 20 and 24 for deploy user
  sudo -u "${DEPLOY_USER}" bash -lc '
    export NVM_DIR="$HOME/.nvm"
    if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    fi
    source "$NVM_DIR/nvm.sh"
    nvm install 20
    nvm install 24
    npm install -g pnpm@10
  '

  # pnpm for root-deployed scripts if needed
  command -v pnpm >/dev/null 2>&1 || npm install -g pnpm@10 2>/dev/null || true

  # Firewall
  ufw allow OpenSSH
  ufw allow 'Nginx Full'
  ufw --force enable

  systemctl enable nginx mysql postgresql fail2ban
  systemctl start nginx mysql postgresql || true

  mkdir -p /var/www /etc/nginx/cloudteor-apps
  touch "${PROVISION_MARKER}"
  log "Global provisioning complete"
}

provision_app_dirs() {
  log "=== App directories: ${APP_NAME} ==="
  mkdir -p "${RELEASES_DIR}" "${SHARED_DIR}/logs" "${SHARED_DIR}/uploads" "${SHARED_DIR}/tmp"
  chown -R "${DEPLOY_USER}:www-data" "${APP_HOME}"
  chmod 775 "${SHARED_DIR}" "${SHARED_DIR}/logs" "${SHARED_DIR}/uploads"
}

provision_database() {
  if [[ "${SKIP_DB_PROVISION:-false}" == "true" ]]; then
    log "Skipping DB provision (SKIP_DB_PROVISION=true)"
    return 0
  fi
  case "${DB_ENGINE}" in
    mysql)
      [[ -n "${DB_PASSWORD:-}" ]] || { log "WARN: Set DB_PASSWORD to auto-provision MySQL"; return 0; }
      DB_NAME="${DB_NAME:-${DB_NAME_DEFAULT}}"
      DB_USER="${DB_USER:-${APP_NAME}}"
      provision_mysql_db
      ;;
    postgresql)
      [[ -n "${DB_PASSWORD:-}" ]] || { log "WARN: Set DB_PASSWORD to auto-provision PostgreSQL"; return 0; }
      DB_NAME="${DB_NAME:-${DB_NAME_DEFAULT}}"
      DB_USER="${DB_USER:-${APP_NAME}}"
      provision_postgres_db
      ;;
  esac
}

install_deploy_scripts() {
  sync_deploy_scripts "${SCRIPTS_ROOT}"
}

main() {
  provision_global
  provision_app_dirs
  provision_database
  render_nginx_config
  render_systemd_unit
  install_deploy_scripts
  nginx_test_reload
  log "=== ${APP_NAME} server ready. Deploy via GitHub Actions or scripts/deploy.sh ==="
}

main "$@"
