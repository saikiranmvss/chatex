#!/usr/bin/env bash
# Roll back to the previous release.
set -Eeuo pipefail

SCRIPTS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPTS_ROOT}/lib/common.sh"

resolve_app_name
acquire_deploy_lock
rollback_current
release_deploy_lock
