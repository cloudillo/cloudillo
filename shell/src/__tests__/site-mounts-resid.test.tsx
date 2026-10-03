// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The pages table's "open in the notes app" link, and the one thing it must never
 * emit: a resId with no owner half.
 *
 * `settings/site.tsx` used to hand-derive the context idTag as
 * `activeContext?.idTag ?? auth?.idTag`, dropping the `apiState.idTag` fallback that
 * `useCurrentContextIdTag()` carries. When that resolved `undefined`, both link
 * builders fell back to a **bare fileId** — which is not a resId at all, and opens
 * the wrong document rather than failing. `~` is a URL shorthand only; it must never
 * reach the owner half of a resId, and neither may nothing.
 *
 * A dead affordance is the right failure here: the row still says what it is, and
 * nothing navigates anywhere wrong.
 */

import type { SiteDoc } from '@cloudillo/types'
import { jest } from '@jest/globals'
import { act, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import { MemoryRouter } from 'react-router-dom'

import { HOME_BASE } from '../routes.js'

jest.unstable_mockModule('react-i18next', () => ({
	Trans: () => null,
	useTranslation: () => ({ t: (key: string) => key })
}))

// The real components under the overrides below, so the mock does not have to
// track every name the panel imports.
const realReact = await import('../../../libs/react/lib/index.js')

jest.unstable_mockModule('@cloudillo/react', () => ({
	...realReact,
	Badge: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
	Button: ({
		children,
		disabled,
		onClick,
		kind: _kind,
		mode: _mode,
		size: _size,
		variant: _variant,
		...rest
	}: {
		children?: React.ReactNode
		disabled?: boolean
		onClick?: () => void
		kind?: string
		mode?: string
		size?: string
		variant?: string
	} & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button type="button" disabled={disabled} onClick={onClick} {...rest}>
			{children}
		</button>
	),
	EmptyState: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	useDialog: () => ({ confirm: async () => true })
}))

/** What the picker answers with, so the path-suggestion case below can name a file. */
let picked: { fileId: string; fileName: string } | undefined

jest.unstable_mockModule('../components/DocumentPicker/index.js', () => ({
	useDocumentPicker: () => ({ pickDocument: async () => picked })
}))

const { SiteMountsPanel } = await import('../settings/site-mounts.js')

const DOCS: SiteDoc[] = [
	{ docFileId: 'f-root', mountPath: '/', publishedFileId: 'c1', publishedMountPath: '/' },
	{ docFileId: 'f-blog', mountPath: '/blog' }
]

/**
 * The path suggested for a picked document, read off the pending row's input.
 *
 * `suggestPath` used to fold accents by dropping `U+0300`–`U+036F` by hand, which
 * `siteTagSlug` and `slugify` both say in as many words not to do: a mark outside
 * that block survives the fold and becomes a `-` separator. It calls `siteTagSlug`
 * now, which matches `\p{M}`.
 */
async function suggestedPath(fileName: string): Promise<string> {
	picked = { fileId: 'f-new', fileName }
	render(
		<MemoryRouter>
			<SiteMountsPanel
				docs={DOCS}
				docNames={{}}
				isLeader={true}
				contextIdTag="alice.tld"
				base={HOME_BASE}
				onMount={async () => {}}
				onUnmount={async () => {}}
				onSetRoot={async () => {}}
				onDocumentName={() => {}}
			/>
		</MemoryRouter>
	)
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name: 'Add a document' }))
	})
	// `t` is mocked to the identity, so the interpolation is not substituted.
	const inputs = screen.getAllByLabelText('Path for {{name}}') as HTMLInputElement[]
	// The pending row is last; the leading `/` is an adornment, not part of the value.
	return inputs[inputs.length - 1].value
}

describe('SiteMountsPanel — the suggested mount path', () => {
	it('should fold an accent rather than turn it into a separator', async () => {
		expect(await suggestedPath('Napló')).toBe('naplo')
	})

	it('should fold a mark outside the Combining Diacritical Marks block', async () => {
		// U+1AB0, in Combining Diacritical Marks *Extended*: the hand-rolled range
		// kept it, and `[^a-z0-9]` then turned it into a `-`.
		expect(await suggestedPath('Va᪰z')).toBe('vaz')
	})
})

function renderPanel(contextIdTag?: string) {
	const { container } = render(
		<MemoryRouter>
			<SiteMountsPanel
				docs={DOCS}
				docNames={{}}
				isLeader={true}
				contextIdTag={contextIdTag}
				base={HOME_BASE}
				onMount={async () => {}}
				onUnmount={async () => {}}
				onSetRoot={async () => {}}
				onDocumentName={() => {}}
			/>
		</MemoryRouter>
	)
	return [...container.querySelectorAll('[href]')].map((a) => a.getAttribute('href') ?? '')
}

describe('SiteMountsPanel — the notes-app link', () => {
	it('should qualify the resId with the context idTag', () => {
		const hrefs = renderPanel('alice.tld')

		expect(hrefs.some((href) => href.includes('alice.tld:f-root'))).toBe(true)
		expect(hrefs.some((href) => href.includes('alice.tld:f-blog'))).toBe(true)
	})

	it('should render no link at all when there is no idTag to qualify it with', () => {
		const hrefs = renderPanel(undefined)

		for (const fileId of ['f-root', 'f-blog']) {
			expect(hrefs.some((href) => href.includes(fileId))).toBe(false)
		}
	})
})

// vim: ts=4
