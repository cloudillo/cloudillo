// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

// Pre-paint boot: loaded as a plain (non-module, non-defer) <script src> at the
// top of <body> in index.html, so the theme classes land before the splash paints.
// Kept out of index.html so the shell CSP can use `script-src 'self'`.
;(function () {
	try {
		window.__cloudilloBootStart = performance.now()
		let theme = null
		let colors = null
		try {
			theme = localStorage.getItem('cloudillo.theme')
			colors = localStorage.getItem('cloudillo.colors')
		} catch (_e) {
			/* localStorage may be unavailable */
		}
		const cl = document.body.classList
		if (theme === 'opaque') {
			cl.add('theme-opaque')
		} else {
			cl.add('theme-glass')
		}
		let dark
		if (colors === 'dark') {
			dark = true
		} else if (colors === 'light') {
			dark = false
		} else {
			dark = !!window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
		}
		cl.add(dark ? 'dark' : 'light')
	} catch (_e) {
		/* never block first paint */
	}
})()

// vim: ts=4
