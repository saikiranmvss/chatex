#!/usr/bin/env bash
# Roll back to the previous release.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

resolve_app_name
acquire_deploy_lock
rollback_current
release_deploy_lock
