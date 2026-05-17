#!/usr/bin/env bash
# Shared deployment helpers — source from deploy/create_server/rollback/setup-ssl scripts.
set -Eeuo pipefail

LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=app.conf
source "${LIB_DIR}/app.conf"

export DEBIAN_FRONTEND=noninteractive
PROVISION_MARKER="/var/lib/cloudteor-provisioned"
WWW_ROOT="/var/www"
DEPLOY_USER="${DEPLOY_USER:-deploy}"

log()  { printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*" >&2; }
die()  { log "ERROR: $*"; exit 1; }
require_cmd() { command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"; }

# Re-exec as root when CI connects as deploy (passwordless sudo required).
require_root_or_sudo() {
  if [[ "$(id -u)" -eq 0 ]]; then
    return 0
  fi
  if sudo -n true 2>/dev/null; then
    # BASH_SOURCE[1] = caller script (create_server.sh, etc.); $0 is "bash" when run as `bash script.sh`
    local script="${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}"
    log "Elevating to root via sudo (${script})"
    exec sudo -E bash "${script}" "$@"
  fi
  die "Need root or passwordless sudo for provisioning. Add deploy to sudo (NOPASSWD) or set GitHub secret SERVER_USER=root for bootstrap."
}

run_as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo -n "$@"
  fi
}

resolve_app_name() {
  APP_NAME="${APP_NAME:-${APP_SLUG}}"
  APP_HOME="${WWW_ROOT}/${APP_NAME}"
  SHARED_DIR="${APP_HOME}/shared"
  RELEASES_DIR="${APP_HOME}/releases"
  CURRENT_LINK="${APP_HOME}/current"
  LOCK_FILE="${SHARED_DIR}/deploy.lock"
  DEPLOY_LOG="${SHARED_DIR}/logs/deploy.log"
}

# Copy scripts to ${APP_HOME}/scripts unless already running from that path (GitHub Actions).
sync_deploy_scripts() {
  local src_dir="$1"
  [[ -n "${src_dir}" ]] || die "sync_deploy_scripts: source directory required"
  resolve_app_name
  local dest="${APP_HOME}/scripts"
  mkdir -p "${dest}"
  local src resolved_dest
  src="$(cd "${src_dir}" && pwd -P)"
  resolved_dest="$(cd "${dest}" && pwd -P)"
  if [[ "${src}" == "${resolved_dest}" ]]; then
    log "Deploy scripts already at ${dest}; skipping copy"
  else
    cp -a "${src_dir}/." "${dest}/"
    log "Installed deploy scripts at ${dest}"
  fi
  chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${dest}"
  chmod +x "${dest}"/*.sh "${dest}/lib/"*.sh 2>/dev/null || true
}

resolve_deploy_mode() {
  if [[ -n "${APP_DOMAIN:-}" ]]; then
    DEPLOY_MODE="domain"
    NGINX_SERVER_NAME="${APP_DOMAIN}"
    BASE_PATH="/"
  elif [[ -n "${APP_SUBDOMAIN:-}" && -n "${SERVER_BASE_DOMAIN:-}" ]]; then
    DEPLOY_MODE="domain"
    NGINX_SERVER_NAME="${APP_SUBDOMAIN}.${SERVER_BASE_DOMAIN}"
    APP_DOMAIN="${NGINX_SERVER_NAME}"
    BASE_PATH="/"
  else
    DEPLOY_MODE="path"
    NGINX_SERVER_NAME="_"
    local slug="${APP_NAME}"
    BASE_PATH="${APP_BASE_PATH:-/${slug}/}"
  fi
  # Normalize BASE_PATH: leading/trailing slashes
  BASE_PATH="/${BASE_PATH#/}"
  BASE_PATH="${BASE_PATH%/}/"
  export DEPLOY_MODE NGINX_SERVER_NAME BASE_PATH APP_DOMAIN
}

nvm_node_path() {
  local ver="$1"
  echo "/home/${DEPLOY_USER}/.nvm/versions/node/v${ver}.*/bin"
}

setup_nvm_for_script() {
  export NVM_DIR="/home/${DEPLOY_USER}/.nvm"
  # shellcheck disable=SC1091
  [[ -s "${NVM_DIR}/nvm.sh" ]] && source "${NVM_DIR}/nvm.sh"
  nvm use "${NODE_VERSION}" >/dev/null 2>&1 || die "Node ${NODE_VERSION} not installed (run create_server.sh)"
}

acquire_deploy_lock() {
  mkdir -p "${SHARED_DIR}/logs"
  exec 200>"${LOCK_FILE}"
  flock -n 200 || die "Another deployment is in progress (lock: ${LOCK_FILE})"
}

release_deploy_lock() {
  flock -u 200 2>/dev/null || true
}

# Send deploy output to deploy.log; mirror to stdout when DEPLOY_LOG_TO_STDOUT=true (CI).
begin_deploy_logging() {
  resolve_app_name
  mkdir -p "${SHARED_DIR}/logs"
  if [[ "${DEPLOY_LOG_TO_STDOUT:-false}" == "true" ]]; then
    exec > >(tee -a "${DEPLOY_LOG}") 2>&1
  else
    exec >>"${DEPLOY_LOG}" 2>&1
  fi
}

tail_deploy_logs_on_failure() {
  resolve_app_name
  log "=== Deploy failed — last lines of deploy.log ==="
  tail -n 80 "${DEPLOY_LOG}" 2>/dev/null || true
  if [[ -f "${SHARED_DIR}/logs/api-error.log" ]]; then
    log "=== api-error.log ==="
    tail -n 40 "${SHARED_DIR}/logs/api-error.log" 2>/dev/null || true
  fi
}

write_env_file() {
  if [[ -n "${ENV_FILE:-}" ]]; then
    log "Writing shared/.env from ENV_FILE secret"
    umask 077
    printf '%s\n' "${ENV_FILE}" > "${SHARED_DIR}/.env"
    chmod 600 "${SHARED_DIR}/.env"
    chown "${DEPLOY_USER}:${DEPLOY_USER}" "${SHARED_DIR}/.env" 2>/dev/null || true
  elif [[ ! -f "${SHARED_DIR}/.env" ]]; then
    log "WARN: No shared/.env — set ENV_FILE secret or create ${SHARED_DIR}/.env manually"
  fi
}

render_template() {
  local tpl="$1" out="$2"
  require_cmd envsubst
  export APP_NAME APP_PORT APP_HOME BASE_PATH DEPLOY_MODE NGINX_SERVER_NAME
  export CLIENT_MAX_BODY_SIZE ENABLE_WEBSOCKET HEALTH_PATH SYSTEMD_UNIT
  export NODE_VERSION API_START_CMD DEPLOY_USER API_CWD_REL
  envsubst '${APP_NAME} ${APP_PORT} ${APP_HOME} ${BASE_PATH} ${DEPLOY_MODE} ${NGINX_SERVER_NAME} ${CLIENT_MAX_BODY_SIZE} ${ENABLE_WEBSOCKET} ${HEALTH_PATH} ${SYSTEMD_UNIT} ${NODE_VERSION} ${API_START_CMD} ${DEPLOY_USER} ${API_CWD_REL}' \
    < "${tpl}" > "${out}"
}

ensure_cloudteor_http_server() {
  mkdir -p /etc/nginx/cloudteor-apps
  local master="/etc/nginx/sites-available/cloudteor-http"
  if [[ ! -f "${master}" ]]; then
    cp "${LIB_DIR}/../templates/nginx-cloudteor-http.conf" "${master}"
    ln -sfn "${master}" /etc/nginx/sites-enabled/cloudteor-http
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
    log "Installed shared cloudteor-http nginx server block"
  fi
}

render_nginx_config() {
  resolve_deploy_mode
  if [[ "${DEPLOY_MODE}" == "domain" ]]; then
    local tpl="${LIB_DIR}/../templates/nginx-domain.conf.tpl"
    local out="/etc/nginx/sites-available/${APP_NAME}"
    render_template "${tpl}" "${out}"
    ln -sfn "${out}" "/etc/nginx/sites-enabled/${APP_NAME}"
    rm -f "/etc/nginx/cloudteor-apps/${APP_NAME}.conf" 2>/dev/null || true
  else
    ensure_cloudteor_http_server
    local tpl="${LIB_DIR}/../templates/nginx-path.conf.tpl"
    local out="/etc/nginx/cloudteor-apps/${APP_NAME}.conf"
    render_template "${tpl}" "${out}"
    rm -f "/etc/nginx/sites-enabled/${APP_NAME}" 2>/dev/null || true
  fi
  log "Rendered nginx (${DEPLOY_MODE}, BASE_PATH=${BASE_PATH})"
}

render_systemd_unit() {
  local tpl="${LIB_DIR}/../templates/systemd-api.service.tpl"
  local out="/etc/systemd/system/${SYSTEMD_UNIT}.service"
  render_template "${tpl}" "${out}"
  systemctl daemon-reload
  systemctl enable "${SYSTEMD_UNIT}.service" >/dev/null 2>&1 || true
}

nginx_test_reload() {
  nginx -t || die "nginx config test failed"
  systemctl reload nginx
  log "nginx reloaded"
}

health_check() {
  local url="http://127.0.0.1:${APP_PORT}${HEALTH_PATH}"
  local attempts="${HEALTH_CHECK_ATTEMPTS:-12}"
  local delay="${HEALTH_CHECK_DELAY:-5}"
  log "Health check: ${url}"
  for ((i=1; i<=attempts; i++)); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      log "Health check passed"
      return 0
    fi
    sleep "${delay}"
  done
  die "Health check failed after ${attempts} attempts: ${url}"
}

prune_releases() {
  local keep="${RELEASES_TO_KEEP:-5}"
  [[ -d "${RELEASES_DIR}" ]] || return 0
  mapfile -t releases < <(ls -1dt "${RELEASES_DIR}"/*/ 2>/dev/null | head -n 999)
  local count=${#releases[@]}
  if (( count <= keep )); then
    return 0
  fi
  for ((i=keep; i<count; i++)); do
    log "Pruning old release: ${releases[$i]}"
    rm -rf "${releases[$i]}"
  done
}

get_previous_release() {
  [[ -L "${CURRENT_LINK}" ]] || return 1
  local current_target
  current_target="$(readlink -f "${CURRENT_LINK}")"
  mapfile -t releases < <(ls -1dt "${RELEASES_DIR}"/*/ 2>/dev/null)
  for rel in "${releases[@]}"; do
    rel="${rel%/}"
    [[ "$(readlink -f "${rel}")" == "${current_target}" ]] && continue
    echo "${rel}"
    return 0
  done
  return 1
}

switch_current() {
  local release_dir="$1"
  ln -sfn "${release_dir}" "${CURRENT_LINK}"
  log "Switched current -> ${release_dir}"
}

rollback_current() {
  local prev
  prev="$(get_previous_release)" || die "No previous release to roll back to"
  switch_current "${prev}"
  restart_api_service
  nginx_test_reload
  health_check
  log "Rolled back to ${prev}"
}

restart_api_service() {
  systemctl restart "${SYSTEMD_UNIT}.service"
  log "Restarted ${SYSTEMD_UNIT}.service"
}

parse_db_password_from_env_file() {
  [[ -n "${DB_PASSWORD:-}" ]] && return 0
  [[ -f "${SHARED_DIR}/.env" ]] || return 0
  local url
  url="$(grep -E '^DATABASE_URL=' "${SHARED_DIR}/.env" | head -1 | cut -d= -f2- | tr -d '\r' || true)"
  if [[ "${url}" =~ mysql://[^:]+:([^@]+)@ ]]; then
    DB_PASSWORD="${BASH_REMATCH[1]}"
  elif [[ "${url}" =~ postgresql://[^:]+:([^@]+)@ ]]; then
    DB_PASSWORD="${BASH_REMATCH[1]}"
  fi
  if [[ -z "${DB_PASSWORD:-}" ]]; then
    DB_PASSWORD="$(grep -E '^DB_PASSWORD=' "${SHARED_DIR}/.env" | head -1 | cut -d= -f2- | tr -d '\r' || true)"
  fi
}

provision_mysql_db() {
  local db_name="${DB_NAME:-${DB_NAME_DEFAULT}}"
  local db_user="${DB_USER:-${APP_NAME}}"
  parse_db_password_from_env_file
  local db_pass="${DB_PASSWORD:-}"
  [[ -n "${db_pass}" ]] || die "DB_PASSWORD secret required (or DATABASE_URL in ENV_FILE)"
  run_as_root mysql -e "CREATE DATABASE IF NOT EXISTS \`${db_name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  run_as_root mysql -e "CREATE USER IF NOT EXISTS '${db_user}'@'localhost' IDENTIFIED BY '${db_pass}';"
  run_as_root mysql -e "ALTER USER '${db_user}'@'localhost' IDENTIFIED BY '${db_pass}';"
  run_as_root mysql -e "GRANT ALL PRIVILEGES ON \`${db_name}\`.* TO '${db_user}'@'localhost';"
  run_as_root mysql -e "FLUSH PRIVILEGES;"
  log "MySQL database ${db_name} and user ${db_user} ready"
}

provision_postgres_db() {
  local db_name="${DB_NAME:-${DB_NAME_DEFAULT}}"
  local db_user="${DB_USER:-${APP_NAME}}"
  parse_db_password_from_env_file
  local db_pass="${DB_PASSWORD:-}"
  [[ -n "${db_pass}" ]] || die "DB_PASSWORD secret required (or DATABASE_URL in ENV_FILE)"
  sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${db_user}'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE USER ${db_user} WITH PASSWORD '${db_pass}';"
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${db_name}'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE DATABASE ${db_name} OWNER ${db_user};"
  log "PostgreSQL database ${db_name} and user ${db_user} ready"
}

link_shared_resources() {
  local release="$1"
  mkdir -p "${SHARED_DIR}/uploads" "${SHARED_DIR}/logs" "${SHARED_DIR}/tmp"
  # .env
  ln -sfn "${SHARED_DIR}/.env" "${release}/.env"
  if [[ -n "${ENV_SYMLINK_REL:-}" ]]; then
    mkdir -p "$(dirname "${release}/${ENV_SYMLINK_REL}")"
    ln -sfn "${SHARED_DIR}/.env" "${release}/${ENV_SYMLINK_REL}"
  fi
  # uploads
  if [[ -n "${UPLOAD_SYMLINK_REL:-}" ]]; then
    local upload_path="${release}/${UPLOAD_SYMLINK_REL}"
    mkdir -p "$(dirname "${upload_path}")"
    rm -rf "${upload_path}"
    ln -sfn "${SHARED_DIR}/uploads" "${upload_path}"
  fi
  # LMS: optional second upload root
  if [[ -n "${UPLOAD_SYMLINK_REL_2:-}" ]]; then
    local upload_path2="${release}/${UPLOAD_SYMLINK_REL_2}"
    mkdir -p "$(dirname "${upload_path2}")"
    rm -rf "${upload_path2}"
    ln -sfn "${SHARED_DIR}/uploads" "${upload_path2}"
  fi
  # logs under shared
  ln -sfn "${SHARED_DIR}/logs" "${release}/logs" 2>/dev/null || true
}

install_production_deps() {
  local release="$1"
  local install_dir="${release}"
  [[ -n "${API_CWD_REL:-}" ]] && install_dir="${release}/${API_CWD_REL}"
  case "${PACKAGE_MANAGER}" in
    pnpm)
      local pnpm_extra="--prod"
      [[ "${FULL_PNPM_INSTALL:-false}" == "true" ]] && pnpm_extra=""
      sudo -u "${DEPLOY_USER}" bash -lc "
        export NVM_DIR=\"\${HOME}/.nvm\"
        source \"\${NVM_DIR}/nvm.sh\"
        nvm use ${NODE_VERSION}
        cd '${install_dir}'
        pnpm install --frozen-lockfile ${pnpm_extra}
      "
      ;;
    npm)
      sudo -u "${DEPLOY_USER}" bash -lc "
        export NVM_DIR=\"\${HOME}/.nvm\"
        source \"\${NVM_DIR}/nvm.sh\"
        nvm use ${NODE_VERSION}
        cd '${install_dir}'
        if [[ -f package-lock.json ]]; then npm ci --omit=dev; else npm install --omit=dev; fi
      "
      ;;
    *)
      die "Unknown PACKAGE_MANAGER: ${PACKAGE_MANAGER}"
      ;;
  esac
}

run_migrations() {
  local release="$1"
  local migrate_flag="${MIGRATE_ON_DEPLOY:-false}"
  [[ "${migrate_flag}" == "true" ]] || { log "Skipping migrations (MIGRATE_ON_DEPLOY != true)"; return 0; }
  if [[ "${MIGRATION_REQUIRES_FORCE:-false}" == "true" && "${MIGRATE_FORCE:-false}" != "true" ]]; then
    log "Skipping destructive migrations (set MIGRATE_FORCE=true to run)"
    return 0
  fi
  [[ -n "${MIGRATION_CMD:-}" ]] || { log "No MIGRATION_CMD configured"; return 0; }
  local migrate_dir="${release}"
  [[ -n "${API_CWD_REL:-}" ]] && migrate_dir="${release}/${API_CWD_REL}"
  sudo -u "${DEPLOY_USER}" bash -lc "
    export NVM_DIR=\"\${HOME}/.nvm\"
    source \"\${NVM_DIR}/nvm.sh\"
    nvm use ${NODE_VERSION}
    cd '${migrate_dir}'
    set -a && [[ -f .env ]] && source .env && set +a
    ${MIGRATION_CMD}
  "
  log "Migrations finished"
}
