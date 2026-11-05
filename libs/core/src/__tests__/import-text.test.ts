// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	decodeImportText,
	MAX_IMPORT_TEXT_SIZE,
	readImportFile,
	refuseImport,
	stripFrontMatter
} from '../import-text.js'

describe('refuseImport', () => {
	const t = (key: string) => key
	const bus = (access: 'read' | 'comment' | 'write') => {
		const calls: [boolean, string?][] = []
		return {
			access,
			calls,
			notifyImportComplete: (success: boolean, error?: string) => {
				calls.push([success, error])
			}
		}
	}

	it('refuses a read-only bus', () => {
		const b = bus('read')
		expect(refuseImport(b, 'text/markdown', t)).toBe(true)
		expect(b.calls).toEqual([[false, 'Read-only document']])
	})

	it('refuses when the app says the document is read-only', () => {
		const b = bus('write')
		expect(refuseImport(b, 'text/markdown', t, true)).toBe(true)
		expect(b.calls).toEqual([[false, 'Read-only document']])
	})

	it('refuses an unsupported type, naming it', () => {
		const b = bus('write')
		const named = (key: string, opts?: Record<string, string>) => `${key}|${opts?.type}`
		expect(refuseImport(b, 'text/plain', named)).toBe(true)
		expect(b.calls).toEqual([[false, 'Unsupported import type: {{type}}|text/plain']])
	})

	it('accepts Markdown on a writable document, and tells the shell nothing', () => {
		const b = bus('write')
		expect(refuseImport(b, 'text/markdown', t)).toBe(false)
		expect(b.calls).toEqual([])
	})
})

describe('decodeImportText', () => {
	it('decodes base64 as UTF-8', () => {
		const bytes = new TextEncoder().encode('árvíztűrő ✓')
		expect(decodeImportText(btoa(String.fromCharCode(...bytes)))).toBe('árvíztűrő ✓')
	})

	it('throws on invalid base64', () => {
		expect(() => decodeImportText('***')).toThrow()
	})

	it('passes at the size limit and throws over it', () => {
		// The longest whole base64 quads within the limit: 3 bytes per 4 characters.
		const atLimit = Math.floor(MAX_IMPORT_TEXT_SIZE / 3) * 4
		expect(decodeImportText('A'.repeat(atLimit))).toHaveLength((atLimit / 4) * 3)
		expect(() => decodeImportText('A'.repeat(atLimit + 4))).toThrow('too large')
	})
})

describe('readImportFile', () => {
	// A stand-in: jsdom's `File` may lack `text()`.
	const file = (size: number) => ({ size, text: async () => 'text' }) as unknown as File

	it('passes at the size limit', async () => {
		await expect(readImportFile(file(MAX_IMPORT_TEXT_SIZE))).resolves.toBe('text')
	})

	it('throws over the size limit', async () => {
		await expect(readImportFile(file(MAX_IMPORT_TEXT_SIZE + 1))).rejects.toThrow('too large')
	})
})

describe('stripFrontMatter', () => {
	it.each([
		['no BOM', ''],
		['a BOM', '﻿']
	])('strips it with %s', (_name, bom) => {
		expect(stripFrontMatter(`${bom}---\ntitle: x\nauthor: y\n---\n\n# a\n`)).toBe('\n# a\n')
	})

	it('accepts every YAML line shape, and CRLF', () => {
		const yaml = 'tags:\n  - a\n- b\n# note\n\nmap:\n  k: v\n'
		expect(stripFrontMatter(`---\n${yaml}---\nbody`)).toBe('body')
		expect(stripFrontMatter(`---\r\n${yaml.replace(/\n/g, '\r\n')}---\r\nbody`)).toBe('body')
	})

	it('leaves a leading horizontal rule alone', () => {
		const md = '---\n\ntext\n\n---\n'
		expect(stripFrontMatter(md)).toBe(md)
	})

	it('leaves prose between two rules alone, even under a `key:` first line', () => {
		const md = '---\nNote: text\n\nA real sentence.\n\n---\n'
		expect(stripFrontMatter(md)).toBe(md)
	})

	it('leaves a list after a blank line alone, even under a `key:` first line', () => {
		const md = '---\nSummary: x\n\n- a\n- b\n\n---\n'
		expect(stripFrontMatter(md)).toBe(md)
	})

	it('strips a flush list under its key', () => {
		expect(stripFrontMatter('---\ntags:\n- a\n- b\n---\nbody')).toBe('body')
	})

	it('leaves an unclosed block alone', () => {
		const md = '---\ntitle: x\n\nbody\n'
		expect(stripFrontMatter(md)).toBe(md)
	})
})

// vim: ts=4
