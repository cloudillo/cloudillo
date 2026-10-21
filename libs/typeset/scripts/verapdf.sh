#!/usr/bin/env bash
# SPDX-FileCopyrightText: Szilárd Hajba
# SPDX-License-Identifier: MPL-2.0
#
# Validate the PDF writer's corpus output with veraPDF (https://verapdf.org), if installed:
# every PDF against PDF/UA-1, the `-pdfa` ones also against PDF/A-2a.
#
#   libs/typeset/scripts/verapdf.sh [out-dir]     (default: a temp dir)
#
# The PDFs come from the jest smoke test (`PDF_OUT=<dir>`): jest loads pdfkit's node build, which
# reads its sRGB ICC profile from beside its own file. The app's browser bundle uses
# `pdfkit.browser.mjs`, which embeds the profile.
set -euo pipefail

if ! command -v verapdf >/dev/null 2>&1; then
	echo "verapdf not found on PATH — skipping. Install the veraPDF CLI (https://docs.verapdf.org/install/) to run this."
	exit 0
fi

cd "$(dirname "$0")/.."
OUT="${1:-$(mktemp -d)}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"

PDF_OUT="$OUT" pnpm test pdf-smoke

status=0
verapdf --format text --flavour ua1 "$OUT"/*.pdf || status=1
verapdf --format text --flavour 2a "$OUT"/*-pdfa.pdf || status=1
echo "PDFs in $OUT"
exit $status
