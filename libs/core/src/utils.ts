// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Delay execution for a specified time
 */
export async function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

import { colord, extend } from 'colord'
import lchPlugin from 'colord/plugins/lch'
extend([lchPlugin])

export async function calcSha1Hex(str: string) {
	// Generate SHA hash from str
	const enc = new TextEncoder()
	const data = enc.encode(str)
	return Array.from(new Uint8Array(await window.crypto.subtle.digest('sha-1', data)))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('')
}

// Color
export async function str2color(
	str: string,
	l: number = 40,
	c: number = 100,
	dark?: boolean
): Promise<string> {
	const hash = await calcSha1Hex(str)

	// Generate color from hash
	const color = colord({ l: dark ? 100 - l : l, c, h: parseInt(hash.slice(0, 3), 16) }).toHex()

	return color
}

export async function str2colors(
	str: string,
	l: number = 40,
	c: number = 100,
	dark?: boolean
): Promise<{ fg: string; bg: string }> {
	const hash = await calcSha1Hex(str)

	// Generate color from hash
	const fg = colord({ l: dark ? 100 - l : l, c, h: parseInt(hash.slice(0, 3), 16) }).toHex()
	const bg = colord({ l: dark ? 100 - l : l, c, h: parseInt(hash.slice(3, 6), 16) }).toHex()

	return { fg, bg }
}

// vim: ts=4
