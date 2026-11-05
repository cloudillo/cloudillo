// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { AppMessageBus } from './message-bus/app-bus.js'

/** The `key:` first line tells YAML front matter from a document opening with a rule. */
const FRONT_MATTER = /^﻿?---[ \t]*\r?\n(?=[\w-]+:\s)([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
/** A `key:` line, an indented line, a `- item`, a `#` comment or a blank line. */
const YAML_LINE = /^(?:[\w-]+:(?:\s|$)|\s|-\s|#|$)/
/** What a top-level `- item` may follow: `key:` with no value, or another item. */
const LIST_OPENER = /^(?:[\w-]+:\s*|\s*-\s.*)$/

/** Larger text would be parsed on the main thread and written as one CRDT update. */
export const MAX_IMPORT_TEXT_SIZE = 5 * 1024 * 1024

type Translate = (key: string, opts?: Record<string, string>) => string

/**
 * Tells the shell a pushed import is refused, if it must be; true = handled.
 * This lib has no i18n bundle: the keys stay in each app's own translation.json.
 */
export function refuseImport(
	bus: Pick<AppMessageBus, 'access' | 'notifyImportComplete'>,
	type: string,
	t: Translate,
	readOnly = false
): boolean {
	if (readOnly || bus.access !== 'write') {
		bus.notifyImportComplete(false, t('Read-only document'))
		return true
	}
	if (type !== 'text/markdown') {
		bus.notifyImportComplete(false, t('Unsupported import type: {{type}}', { type }))
		return true
	}
	return false
}

/** The text of a file picked in the app; throws past `MAX_IMPORT_TEXT_SIZE`. */
export async function readImportFile(file: File): Promise<string> {
	if (file.size > MAX_IMPORT_TEXT_SIZE) throw new Error('Import file too large')
	return file.text()
}

/** The text of a file the shell pushes as base64; throws past `MAX_IMPORT_TEXT_SIZE`. */
export function decodeImportText(base64: string): string {
	if (base64.length * 0.75 > MAX_IMPORT_TEXT_SIZE) throw new Error('Import file too large')
	const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
	return new TextDecoder().decode(bytes)
}

/** Drops leading YAML front matter; a prose line between the rules means it is none. */
export function stripFrontMatter(md: string): string {
	const match = FRONT_MATTER.exec(md)
	if (!match) return md
	const lines = match[1].split(/\r?\n/)
	const yaml = lines.every(
		(line, i) => YAML_LINE.test(line) && (!/^-\s/.test(line) || LIST_OPENER.test(lines[i - 1]))
	)
	return yaml ? md.slice(match[0].length) : md
}

// vim: ts=4
