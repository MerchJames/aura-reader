#!/usr/bin/env bash
# Stage Chromium's few missing system libraries locally, no root required.
#
# WSL/minimal Ubuntu lacks libnspr4/libnss3/libasound that Playwright's Chromium
# needs, and `playwright install-deps` wants sudo. Instead we `apt-get download`
# the .debs (no root) and extract them into ~/.cache/pw-syslibs; playwright.config.ts
# adds that dir to LD_LIBRARY_PATH when it exists. Idempotent — safe to re-run.
set -euo pipefail

PREFIX="${HOME}/.cache/pw-syslibs"
LIBDIR="${PREFIX}/root/usr/lib/x86_64-linux-gnu"
PKGS=(libnspr4 libnss3 libasound2t64)

if [ -f "${LIBDIR}/libnss3.so" ] && [ -f "${LIBDIR}/libnspr4.so" ] && [ -f "${LIBDIR}/libasound.so.2" ]; then
  echo "Browser libs already staged at ${LIBDIR}"
  exit 0
fi

echo "Staging Chromium system libs into ${PREFIX} …"
mkdir -p "${PREFIX}/debs" "${PREFIX}/root"
cd "${PREFIX}/debs"
apt-get download "${PKGS[@]}"
for d in *.deb; do dpkg -x "$d" "${PREFIX}/root"; done

echo "Done. Staged:"
ls "${LIBDIR}" | grep -E "libnspr4|libnss3|libnssutil3|libasound" || true
