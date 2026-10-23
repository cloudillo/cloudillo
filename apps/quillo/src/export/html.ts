// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { docBaseName, downloadBlob, escapeHtml, sanitizeFilename } from '@cloudillo/core'

import { cleanExportUrl } from './links.js'

/** Download `bodyHtml` (from `quill.getSemanticHTML()`) as a standalone HTML document. */
export function exportHtml(bodyHtml: string) {
	const body = new DOMParser().parseFromString(bodyHtml, 'text/html').body
	// File URLs carry the session's access token; it must not end up in a saved file
	for (const el of body.querySelectorAll('[src], [href]')) {
		for (const attr of ['src', 'href'] as const) {
			const value = el.getAttribute(attr)
			if (value === null) continue
			const clean = cleanExportUrl(value, attr)
			if (clean === undefined) el.removeAttribute(attr)
			else el.setAttribute(attr, clean)
		}
	}
	const title = docBaseName() || 'document'
	const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
</head>
<body>
${body.innerHTML}
</body>
</html>
`
	downloadBlob(new Blob([html], { type: 'text/html' }), `${sanitizeFilename(title)}.html`)
}

// vim: ts=4
