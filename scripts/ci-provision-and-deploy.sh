#!/usr/bin/env bash
# Called on the server by GitHub Actions (via SSH). Provisions idempotently, then deploys.
# Usage: ci-provision-and-deploy.sh /tmp/artifact.tar.gz
set -Eeuo pipefail

ARTIFACT="${1:?artifact path required}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_root_or_sudo

log "=== CI: provision + deploy for ${APP_NAME:-app} ==="
bash "${SCRIPT_DIR}/create_server.sh"
bash "${SCRIPT_DIR}/deploy.sh" "${ARTIFACT}"
