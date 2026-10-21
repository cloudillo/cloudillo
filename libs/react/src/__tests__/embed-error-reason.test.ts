// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { EMBED_ERR_CYCLE, EMBED_ERR_DEPTH } from '@cloudillo/core'

import { embedErrorReason } from '../components/DocumentEmbed/useDocumentEmbed.js'

describe('embedErrorReason', () => {
	it('classifies depth and cycle refusals as nested', () => {
		expect(embedErrorReason(EMBED_ERR_DEPTH)).toBe('nested')
		expect(embedErrorReason(EMBED_ERR_CYCLE)).toBe('nested')
	})

	it('leaves other errors unclassified', () => {
		expect(embedErrorReason('Failed to obtain scoped token')).toBeUndefined()
		expect(embedErrorReason(undefined)).toBeUndefined()
	})
})

// vim: ts=4
