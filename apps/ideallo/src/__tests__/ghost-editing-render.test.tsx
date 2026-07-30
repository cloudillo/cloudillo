// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The ghost layer renders the SAME ObjectRenderer the committed layer does, so it needs the same
 * context: without `ownerTag`/`token` an image ghost falls back to a relative `/api/files` URL,
 * and ideallo runs sandboxed on the app origin, which does not serve that path - so every remote
 * drag of an image showed all the other peers a "failed to load" box.
 */

import { render } from '@testing-library/react'
import * as React from 'react'
import * as Y from 'yjs'

import { GhostEditing } from '../components/GhostEditing.js'
import { getOrCreateDocument } from '../crdt/document.js'
import type { StoredObject, YIdealloDocument } from '../crdt/stored-types.js'
import type { IdealloPresence } from '../hooks/index.js'

const IMAGE_ID = 'img1'

function makeDoc(): { doc: YIdealloDocument; objects: Record<string, StoredObject> } {
	const doc = getOrCreateDocument(new Y.Doc())
	const image: StoredObject = { t: 'I', xy: [0, 0], wh: [100, 80], fid: 'file-42' }
	doc.o.set(IMAGE_ID, image)
	doc.r.push([IMAGE_ID])
	return { doc, objects: { [IMAGE_ID]: image } }
}

function presence(): Map<number, IdealloPresence> {
	return new Map([
		[
			7,
			{
				user: { name: 'Peer', color: '#ff0000' },
				editing: { objectIds: [IMAGE_ID], action: 'drag' as const, dx: 25, dy: 10 }
			}
		]
	])
}

function renderGhosts(props: { ownerTag?: string; token?: string }) {
	const { doc, objects } = makeDoc()
	const { container } = render(
		<svg>
			<GhostEditing doc={doc} remotePresence={presence()} objects={objects} {...props} />
		</svg>
	)
	return container.querySelector('image')
}

describe('GhostEditing', () => {
	it('resolves an image ghost against the owner and the access token', () => {
		const node = renderGhosts({ ownerTag: 'alice.cloudillo.net', token: 'tok123' })
		const href = node?.getAttribute('href') ?? ''
		expect(href).toContain('alice.cloudillo.net')
		expect(href).toContain('file-42')
		expect(href).toContain('token=tok123')
	})

	// The standalone case still renders; it simply has no owner to resolve against
	it('falls back to a relative URL with no owner', () => {
		const node = renderGhosts({})
		expect(node?.getAttribute('href')).toContain('/api/files/file-42')
	})
})

// vim: ts=4
