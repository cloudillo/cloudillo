// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Messages between the presenter (controller) and the Presentation API receiver
 * (`receiver.html`), sent as JSON strings over the `PresentationConnection`.
 *
 * `init` is always the first message: a short-lived read-only token scoped to the
 * presentation file (`file:<fileId>:R`), never put in the receiver URL.
 */

import { isFileId, isIdTag } from '@cloudillo/core'

/** Session id kept for `PresentationRequest.reconnect()` after a presenter reload */
export const PRESENTATION_ID_KEY = 'prezillo.presentationId'

export type BlankMode = 'black' | 'white'

export type PresentationMsg =
	| { type: 'init'; token: string; ownerIdTag: string; fileId: string }
	| { type: 'token'; token: string }
	/** `step` is the animation step; prezillo has no animations yet, so always 0 */
	| { type: 'slide'; index: number; step: number }
	/** Laser pointer, normalised 0..1 over the slide; null = hidden */
	| { type: 'pointer'; at: { x: number; y: number } | null }
	| { type: 'blank'; mode: BlankMode | null }
	| { type: 'poll'; counts: Record<string, number>; total: number; winners: string[] }
	| { type: 'media'; objectId: string; action: 'play' | 'pause' | 'seek'; time?: number }
	| { type: 'end' }

export function encode(msg: PresentationMsg): string {
	return JSON.stringify(msg)
}

const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isObj = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v)

function isValid(m: Record<string, unknown>): boolean {
	switch (m.type) {
		case 'init':
			// The receiver builds API URLs from these: path-like values must not get through
			return (
				isStr(m.token) &&
				isStr(m.ownerIdTag) &&
				isIdTag(m.ownerIdTag) &&
				isStr(m.fileId) &&
				isFileId(m.fileId)
			)
		case 'token':
			return isStr(m.token)
		case 'slide':
			return isNum(m.index) && m.index >= 0 && isNum(m.step)
		case 'pointer':
			return m.at === null || (isObj(m.at) && isNum(m.at.x) && isNum(m.at.y))
		case 'blank':
			return m.mode === null || m.mode === 'black' || m.mode === 'white'
		case 'poll':
			return (
				isObj(m.counts) &&
				Object.values(m.counts).every(isNum) &&
				isNum(m.total) &&
				Array.isArray(m.winners) &&
				m.winners.every(isStr)
			)
		case 'media':
			return (
				isStr(m.objectId) &&
				(m.action === 'play' || m.action === 'pause' || m.action === 'seek') &&
				(m.time === undefined || isNum(m.time))
			)
		case 'end':
			return true
		default:
			return false
	}
}

/** Parse one message; undefined for anything malformed or unknown */
export function decode(raw: unknown): PresentationMsg | undefined {
	if (!isStr(raw)) return undefined
	let m: unknown
	try {
		m = JSON.parse(raw)
	} catch {
		return undefined
	}
	return isObj(m) && isValid(m) ? (m as PresentationMsg) : undefined
}

// vim: ts=4
