// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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

	console.log('str2color', str, hash, color, parseInt(hash.slice(0, 3), 16))
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
