// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * SVG font helpers: find the faces an SVG's text uses, and load them.
 */

import type { FontFaceRef } from './font-files.js'

interface FontProps {
	family?: string
	weight?: string
	style?: string
}

/** A presentation attribute, or the same property from the inline `style` (which wins) */
function readProp(el: Element, name: string): string | undefined {
	const inline = el.getAttribute('style')
	if (inline) {
		const m = inline.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i'))
		if (m) return m[1].trim()
	}
	return el.getAttribute(name)?.trim() || undefined
}

/** First entry of a CSS font-family list, unquoted */
export function firstFamily(list: string): string {
	return list
		.split(',')[0]
		.trim()
		.replace(/^(['"])(.*)\1$/, '$2')
}

/**
 * Every distinct face used by `<text>`/`<tspan>`/`<textPath>` under `root` (root included),
 * with font properties inherited down the tree. Families are returned as written (first list
 * entry); text with no font-family anywhere up the chain is skipped.
 */
export function collectSvgFonts(root: Element): FontFaceRef[] {
	const faces = new Map<string, FontFaceRef>()

	function walk(el: Element, inherited: FontProps) {
		const props: FontProps = {
			family: readProp(el, 'font-family') ?? inherited.family,
			weight: readProp(el, 'font-weight') ?? inherited.weight,
			style: readProp(el, 'font-style') ?? inherited.style
		}
		const tag = el.localName
		if ((tag === 'text' || tag === 'tspan' || tag === 'textPath') && props.family) {
			const family = firstFamily(props.family)
			const w = props.weight?.toLowerCase()
			const weight = w === 'bold' || w === 'bolder' || Number(w) >= 700 ? 'bold' : 'normal'
			const style = /italic|oblique/i.test(props.style ?? '') ? 'italic' : 'normal'
			if (family) faces.set(`${family}|${weight}|${style}`, { family, weight, style })
		}
		for (const child of Array.from(el.children)) walk(child, props)
	}

	walk(root, {})
	return Array.from(faces.values())
}

/**
 * Load the given faces through `document.fonts`, waiting at most `timeoutMs` (late faces
 * still arrive, just after we stop waiting). True if any face was not loaded yet, i.e. text
 * drawn or measured before this call may have used a fallback.
 */
export async function loadFontFaces(faces: FontFaceRef[], timeoutMs = 3000): Promise<boolean> {
	// Absent outside a browser (jsdom)
	const fonts = globalThis.document?.fonts
	if (!fonts) return false
	const specs = faces
		.map((f) => `${f.style} ${f.weight} 16px "${f.family.replace(/["\\]/g, '')}"`)
		.filter((spec) => {
			// check() throws on a spec it cannot parse; the family may come from a peer
			try {
				return !fonts.check(spec)
			} catch {
				return false
			}
		})
	if (!specs.length) return false
	await Promise.race([
		Promise.allSettled(specs.map((spec) => fonts.load(spec))),
		new Promise((resolve) => setTimeout(resolve, timeoutMs))
	])
	return true
}

// vim: ts=4
