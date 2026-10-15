// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import 'fake-indexeddb/auto'

import { addUserWord, userWords } from '../editor/user-words.js'

describe('user words', () => {
	it('stores each word once', async () => {
		await addUserWord('foo')
		await addUserWord('bar')
		await addUserWord('foo')
		expect((await userWords()).sort()).toEqual(['bar', 'foo'])
	})
})
