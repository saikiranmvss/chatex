#!/usr/bin/env bash
# Production deploy — invoked by GitHub Actions over SSH.
# Usage: deploy.sh /path/to/artifact.tar.gz
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

ARTIFACT="${1:-}"
[[ -n "${ARTIFACT}" && -f "${ARTIFACT}" ]] || die "Usage: $0 <artifact.tar.gz>"

resolve_app_name
resolve_deploy_mode
mkdir -p "${SHARED_DIR}/logs"
exec >>"${DEPLOY_LOG}" 2>&1

PREVIOUS_RELEASE=""
if [[ -L "${CURRENT_LINK}" ]]; then
  PREVIOUS_RELEASE="$(readlink -f "${CURRENT_LINK}")"
fi

rollback_on_error() {
  log "DEPLOY FAILED — rolling back"
  if [[ -n "${PREVIOUS_RELEASE}" && -d "${PREVIOUS_RELEASE}" ]]; then
    switch_current "${PREVIOUS_RELEASE}"
    restart_api_service || true
    nginx_test_reload || true
  fi
  release_deploy_lock
  exit 1
}
trap rollback_on_error ERR

main() {
  acquire_deploy_lock
  log "=== Deploy ${APP_NAME} started ==="

  mkdir -p "${RELEASES_DIR}" "${SHARED_DIR}/logs" "${SHARED_DIR}/uploads" "${SHARED_DIR}/tmp"
  chown -R "${DEPLOY_USER}:www-data" "${APP_HOME}" 2>/dev/null || true

  write_env_file

  local ts release_dir
  ts="$(date -u +'%Y%m%d_%H%M%S')"
  release_dir="${RELEASES_DIR}/${ts}"
  mkdir -p "${release_dir}"

  log "Extracting ${ARTIFACT} -> ${release_dir}"
  tar -xzf "${ARTIFACT}" -C "${release_dir}"
  chown -R "${DEPLOY_USER}:www-data" "${release_dir}"

  # Normalize: artifact may contain one top-level folder
  local top
  top="$(find "${release_dir}" -mindepth 1 -maxdepth 1 -type d | head -1)"
  if [[ "$(find "${release_dir}" -mindepth 1 -maxdepth 1 | wc -l)" -eq 1 && -f "${top}/package.json" ]]; then
    shopt -s dotglob
    mv "${top}"/* "${release_dir}/"
    rmdir "${top}" 2>/dev/null || true
    shopt -u dotglob
  fi

  link_shared_resources "${release_dir}"

  # Web root symlink for nginx
  ln -sfn "${WEB_ROOT_REL}" "${release_dir}/web"

  log "Installing production dependencies"
  install_production_deps "${release_dir}"

  run_migrations "${release_dir}"

  switch_current "${release_dir}"

  render_nginx_config
  render_systemd_unit
  restart_api_service
  nginx_test_reload

  health_check
  prune_releases

  # SSL when domain configured
  if [[ "${DEPLOY_MODE}" == "domain" && -n "${APP_DOMAIN:-}" ]]; then
    bash "${SCRIPT_DIR}/setup-ssl.sh" || log "WARN: SSL setup skipped or failed (non-fatal)"
  fi

  # Keep server-side scripts in sync with latest release
  mkdir -p "${APP_HOME}/scripts"
  cp -a "${SCRIPT_DIR}/." "${APP_HOME}/scripts/"
  chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_HOME}/scripts"
  chmod +x "${APP_HOME}/scripts/"*.sh "${APP_HOME}/scripts/lib/"*.sh 2>/dev/null || true

  trap - ERR
  release_deploy_lock
  log "=== Deploy ${APP_NAME} complete: ${release_dir} ==="
}

main "$@"
