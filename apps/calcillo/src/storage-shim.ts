// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// Calcillo runs inside a sandboxed iframe that deliberately omits `allow-same-origin`
// (the shell keeps apps on an opaque origin to protect the ServiceWorker encryption
// key — see shell/src/apps/index.tsx). In that mode the browser throws a SecurityError
// whenever any script merely touches `sessionStorage` / `localStorage`.
//
// Fortune Sheet's right-click "Paste" handler reads
// `sessionStorage.getItem("localClipboard")` synchronously *before* it awaits
// `navigator.clipboard.readText()`, so that throw aborts the whole paste before the
// real (now permission-granted) clipboard read can run. Fortune Sheet never writes that
// key, so the value is always empty anyway — the actual paste content comes from the
// async Clipboard API. Installing a harmless in-memory Storage shim whenever the native
// storage is unavailable lets the synchronous access return cleanly so the clipboard
// read proceeds.

function createMemoryStorage(): Storage {
	const map = new Map<string, string>()
	return {
		get length() {
			return map.size
		},
		clear() {
			map.clear()
		},
		getItem(key: string) {
			return map.has(key) ? map.get(key)! : null
		},
		key(index: number) {
			return Array.from(map.keys())[index] ?? null
		},
		removeItem(key: string) {
			map.delete(key)
		},
		setItem(key: string, value: string) {
			map.set(key, String(value))
		}
	} as Storage
}

function ensureStorage(name: 'sessionStorage' | 'localStorage') {
	try {
		// Both touching the property and operating on it can throw in a sandboxed
		// (no allow-same-origin) iframe — probe before deciding to shim.
		window[name].getItem('__cloudillo_probe__')
		return
	} catch {
		try {
			Object.defineProperty(window, name, {
				value: createMemoryStorage(),
				configurable: true
			})
		} catch {
			// Nothing more we can do; native storage stays inaccessible.
		}
	}
}

ensureStorage('sessionStorage')
ensureStorage('localStorage')

// vim: ts=4
