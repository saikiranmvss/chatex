#!/usr/bin/env bash
# Called on the server by GitHub Actions (via SSH). Provisions idempotently, then deploys.
# Usage: ci-provision-and-deploy.sh /tmp/artifact.tar.gz
set -Eeuo pipefail

ARTIFACT="${1:?artifact path required}"
SCRIPTS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPTS_ROOT}/lib/common.sh"

require_root_or_sudo

log "=== CI: provision + deploy for ${APP_NAME:-app} ==="
bash "${SCRIPTS_ROOT}/create_server.sh"
if ! bash "${SCRIPTS_ROOT}/deploy.sh" "${ARTIFACT}"; then
  tail_deploy_logs_on_failure
  exit 1
fi
