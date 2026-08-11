// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as T from '@symbion/runtype'

import { MESSAGE_REGISTRY, validateMessage } from '../../message-bus/registry'
import {
	type DocInfo,
	PROTOCOL_VERSION,
	tDocInfo,
	tDocInfoPush,
	tDocRenameReq
} from '../../message-bus/types'

const READY_INFO: DocInfo = {
	resId: '@alice.example.com:f1~abc',
	fileId: 'f1~abc',
	state: 'ready',
	fileName: 'Notes.md',
	isCrossOwner: false,
	canRename: true
}

describe('tDocInfo', () => {
	/** The tagged literal is the only guard on `state`; keep it failing loudly. */
	it('rejects an unknown state', () => {
		expect(T.isOk(T.decode(tDocInfo, { ...READY_INFO, state: 'pending' }))).toBe(false)
	})
})

describe('tDocRenameReq', () => {
	const req = {
		cloudillo: true,
		v: PROTOCOL_VERSION,
		type: 'doc:rename.req',
		id: 1,
		payload: { fileName: 'Renamed.md' }
	}

	it('accepts a rename carrying only the new name', () => {
		expect(T.isOk(T.decode(tDocRenameReq, req))).toBe(true)
	})

	/**
	 * The shell derives the rename target from the connection's resId. If the
	 * message ever carried a file target, an app could aim a rename at any file
	 * its token happens to reach. Keep this failing loudly.
	 */
	it('has no file target field an app could aim elsewhere', () => {
		const decoded = T.decode(tDocRenameReq, req)
		expect(T.isOk(decoded)).toBe(true)
		if (T.isOk(decoded)) {
			expect(Object.keys(decoded.ok.payload)).toEqual(['fileName'])
		}

		// And a smuggled target is rejected rather than ignored
		for (const smuggled of [{ fileId: 'f2~other' }, { resId: '@eve.example.com:f2~other' }]) {
			const attempt = T.decode(tDocRenameReq, {
				...req,
				payload: { fileName: 'x', ...smuggled }
			})
			expect(T.isOk(attempt)).toBe(false)
		}
	})

	it('rejects a rename with no name', () => {
		expect(T.isOk(T.decode(tDocRenameReq, { ...req, payload: {} }))).toBe(false)
	})
})

describe('registry', () => {
	/**
	 * Profiles are resolved by the app against the DOCUMENT's node, not through
	 * the shell — the shell can only answer from the viewer's own mirror, which
	 * has never heard of a stranger on a foreign-hosted document. Keep the dead
	 * message surface from creeping back.
	 */
	it('has no profile message pair', () => {
		expect(Object.keys(MESSAGE_REGISTRY).filter((t) => t.startsWith('profile:'))).toEqual([])
	})

	it('validates a doc:info.push arriving from the shell', () => {
		const msg = {
			cloudillo: true,
			v: PROTOCOL_VERSION,
			type: 'doc:info.push',
			payload: READY_INFO
		}
		expect(T.isOk(T.decode(tDocInfoPush, msg))).toBe(true)
		expect(validateMessage(msg, 'shell>app')).toBeDefined()
		// A push may only travel shell -> app
		expect(validateMessage(msg, 'app>shell')).toBeUndefined()
	})
})

// vim: ts=4
