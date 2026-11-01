// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { decode, encode, type PresentationMsg } from '../presentation-channel'

describe('presentation channel', () => {
	const messages: PresentationMsg[] = [
		{ type: 'init', token: 'tok', ownerIdTag: 'alice.example', fileId: 'f1' },
		{ type: 'token', token: 'tok2' },
		{ type: 'slide', index: 3, step: 0 },
		{ type: 'pointer', at: { x: 0.25, y: 0.75 } },
		{ type: 'pointer', at: null },
		{ type: 'blank', mode: 'black' },
		{ type: 'blank', mode: 'white' },
		{ type: 'blank', mode: null },
		{ type: 'poll', counts: { a: 2, b: 1 }, total: 3, winners: ['a'] },
		{ type: 'media', objectId: 'o1', action: 'seek', time: 12.5 },
		{ type: 'media', objectId: 'o1', action: 'play' },
		{ type: 'end' }
	]

	it.each(messages.map((m) => [m.type, m]))('round-trips %s', (_type, msg) => {
		expect(decode(encode(msg))).toEqual(msg)
	})

	it.each([
		['not a string', 42],
		['bad JSON', '{'],
		['array', '[]'],
		['null', 'null'],
		['unknown type', '{"type":"hello"}'],
		['init without token', '{"type":"init","ownerIdTag":"a","fileId":"f"}'],
		['init path-like owner', '{"type":"init","token":"t","ownerIdTag":"../x","fileId":"f1"}'],
		[
			'init path-like file',
			'{"type":"init","token":"t","ownerIdTag":"a.example","fileId":"../f"}'
		],
		['negative slide', '{"type":"slide","index":-1,"step":0}'],
		['slide NaN-ish', '{"type":"slide","index":"1","step":0}'],
		['pointer without y', '{"type":"pointer","at":{"x":1}}'],
		['blank grey', '{"type":"blank","mode":"grey"}'],
		['poll bad count', '{"type":"poll","counts":{"a":"1"},"total":1,"winners":[]}'],
		['media bad action', '{"type":"media","objectId":"o","action":"stop"}']
	])('rejects %s', (_name, raw) => {
		expect(decode(raw)).toBeUndefined()
	})
})

// vim: ts=4
