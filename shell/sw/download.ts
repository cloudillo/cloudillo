// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The `/cl-download` handler: turns an in-page download link into an
 * authenticated, correctly-named attachment response, for the own tenant and
 * for federated files alike.
 */

import { ensureIdTag, isValidIdTag } from './id-tag.js'
import { ensureProxyToken } from './proxy-token.js'
import { getAuthToken } from './state.js'
import { requestTokenOnce, waitForToken } from './token-replay.js'

// `name` is a query parameter, so it is unbounded; cap it before it reaches a
// header. Comfortably above any real filename and well inside every server's
// header-size limit even after percent-encoding.
const MAX_FILENAME_LEN = 255

/** Exported for its test. */
export function contentDisposition(name: string): string {
	// Bounded by code points, not UTF-16 code units: a cut landing between a
	// surrogate pair leaves a lone surrogate, and `encodeURIComponent` throws
	// `URIError` on it.
	const bounded = Array.from(name).slice(0, MAX_FILENAME_LEN).join('')
	// ASCII-sanitized fallback for legacy parsers + RFC 5987 UTF-8 for the rest.
	// Non-printables go first (that's what blocks CRLF header injection); the
	// quote AND the backslash follow, because a trailing `\` would otherwise
	// escape the closing quote of the quoted-string and swallow the rest.
	const ascii = bounded.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, "'")
	// encodeURIComponent leaves `!'()*-._~` raw, but RFC 8187's attr-char set has
	// no `'`, `(`, `)` or `*` — and a literal `'` is the delimiter of the
	// charset'language'value triple, so it would split the parameter.
	const ext = encodeURIComponent(bounded).replace(
		/['()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
	)
	return `attachment; filename="${ascii}"; filename*=UTF-8''${ext}`
}

/**
 * The response goes straight to `evt.respondWith`, so a throw here — an offline
 * upstream fetch, a header the browser rejects — would surface as a raw network
 * error with no response at all. Answer with a status instead.
 */
export async function handleDownload(reqUrl: URL): Promise<Response> {
	try {
		return await runDownload(reqUrl)
	} catch (err) {
		// LOGGING RULE: the path and the failure, never a body or a token.
		console.warn('[SW] download failed:', reqUrl.pathname, err)
		return new Response('Download failed', { status: 502 })
	}
}

async function runDownload(reqUrl: URL): Promise<Response> {
	const fileId = reqUrl.searchParams.get('fileId')
	const targetTag = reqUrl.searchParams.get('idTag')
	const name = reqUrl.searchParams.get('name') || 'download'
	if (!fileId || !targetTag) return new Response('Bad download request', { status: 400 })
	// Both go straight into the upstream URL, so bound their shape before they can
	// reshape it. fileId is a path segment; targetTag is a host name.
	if (!/^[A-Za-z0-9._~-]+$/.test(fileId) || !isValidIdTag(targetTag)) {
		return new Response('Bad download request', { status: 400 })
	}

	// The own-vs-federated discriminator.
	const idTag = await ensureIdTag()

	// After an SW restart there is no token in memory — ask the page.
	if (!getAuthToken()) {
		void requestTokenOnce()
		await waitForToken(1500)
	}
	const authToken = getAuthToken()

	// Own tenant → primary token; federated → proxy token. With our own idTag
	// unresolved the two are indistinguishable, and handing the home bearer to a
	// host that may not be ours is not a trade worth making — go unauthenticated.
	let token: string | undefined
	if (!idTag) {
		token = undefined
	} else if (targetTag === idTag) {
		token = authToken
	} else if (authToken) {
		try {
			token = await ensureProxyToken(targetTag)
		} catch (err) {
			console.warn('[SW] download proxy-token failed', err)
			token = undefined
		}
	}

	const realUrl = 'https://cl-o.' + targetTag + '/api/files/' + fileId
	const headers = new Headers()
	if (token) headers.set('Authorization', `Bearer ${token}`)
	const upstream = await fetch(realUrl, { headers, mode: 'cors' })

	// Surface backend errors verbatim (no attachment header → browser won't save
	// an error body as a file).
	if (!upstream.ok) return upstream

	const out = new Headers()
	const ct = upstream.headers.get('Content-Type')
	if (ct) out.set('Content-Type', ct)
	const len = upstream.headers.get('Content-Length')
	if (len) out.set('Content-Length', len)
	out.set('Content-Disposition', contentDisposition(name))
	// Streamed, not buffered. The upstream status is preserved: rewriting a 206 as
	// a 200 would claim a partial body is the whole file.
	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers: out
	})
}
// vim: ts=4
