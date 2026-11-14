// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as Y from 'yjs'

import { checkDocSchema, docSchemaAtLeast, stampDocSchema } from '../doc-schema.js'

function meta(schema?: unknown): Y.Map<unknown> {
	const m = new Y.Doc().getMap<unknown>('m')
	if (schema !== undefined) m.set('schema', schema)
	return m
}

describe('checkDocSchema', () => {
	it('treats a missing schema as writable', () => {
		expect(checkDocSchema(meta(), 1)).toBe('rw')
	})
	it('is writable at the supported schema', () => {
		expect(checkDocSchema(meta(1), 1)).toBe('rw')
	})
	it('is read-only above the supported schema', () => {
		expect(checkDocSchema(meta(2), 1)).toBe('ro')
	})
	it.each(['3', Number.NaN, -1, 1.5, 1e9])('treats an invalid schema %p as missing', (v) => {
		expect(checkDocSchema(meta(v), 1)).toBe('rw')
	})
})

describe('stampDocSchema', () => {
	it('stamps a missing schema', () => {
		const m = meta()
		stampDocSchema(m, 1)
		expect(m.get('schema')).toBe(1)
	})
	it('never lowers the schema', () => {
		const m = meta(5)
		stampDocSchema(m, 1)
		expect(m.get('schema')).toBe(5)
	})
	it('leaves a newer schema alone', () => {
		const m = meta(7)
		stampDocSchema(m, 1)
		expect(m.get('schema')).toBe(7)
	})
	it.each(['3', Number.NaN, -1, 1.5, 1e9])('restamps an invalid schema %p', (v) => {
		const m = meta(v)
		stampDocSchema(m, 1)
		expect(m.get('schema')).toBe(1)
	})
})

describe('docSchemaAtLeast', () => {
	it('is true only for a numeric schema >= n', () => {
		expect(docSchemaAtLeast(meta(2), 2)).toBe(true)
		expect(docSchemaAtLeast(meta(3), 2)).toBe(true)
		expect(docSchemaAtLeast(meta(1), 2)).toBe(false)
		expect(docSchemaAtLeast(meta(), 2)).toBe(false)
		expect(docSchemaAtLeast(meta('9'), 2)).toBe(false)
	})
	it.each([1e9, 1.5, -1])('treats an invalid schema %p as missing', (v) => {
		expect(docSchemaAtLeast(meta(v), 1)).toBe(false)
	})
})

// vim: ts=4
