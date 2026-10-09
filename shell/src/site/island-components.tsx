// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The two island renderers the shell owns.
 *
 * `island-registry.tsx` carries `video` and `audio`, plain players that need nothing
 * but their `src`. The other two built-ins live here because neither works without
 * the rest of the shell: `documentEmbed` needs a pending registration on the shell
 * bus, and `image` opens the shell's lightbox.
 *
 * Every prop is untrusted input read off a published page, so anything used as a URL
 * goes through `safeHref` first.
 */

import { safeHref, sitePositiveInt, tAnyValue } from '@cloudillo/core'
import { normalizeEmbedSettings, useApi, VBox, ViewEmbed } from '@cloudillo/react'
import * as T from '@symbion/runtype'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'

import { version } from '../../package.json'
import { AppLoadingIndicator } from '../apps/AppLoadingIndicator.js'
import { registerShellEmbed, releaseShellEmbed, useShellEmbed } from '../shell-embed.js'
import type { SiteIslandProps } from './island-registry.js'
import { registerSiteIsland } from './island-registry.js'

/**
 * The marked element the portal is rendering into.
 *
 * An `enhance` island must not clear its container — the static `<img>` is the real
 * content — so its component reaches the existing DOM instead of replacing it. It
 * rides in a shell-local context rather than in `SiteIslandProps`, which would put a
 * DOM node into the contract shared with app-declared islands.
 */
export const SiteIslandContainerContext = React.createContext<HTMLElement | null>(null)

function useSiteIslandContainer(): HTMLElement | null {
	return React.useContext(SiteIslandContainerContext)
}

/**
 * `data-props` is JSON off a published page, so each island decodes what it reads
 * rather than sniffing it field by field.
 *
 * Every field is optional and unknown ones `'drop'`: a prop another publisher
 * generation did or did not write must leave the island renderable. The decode proves
 * a value is a *string*; `safeHref` proves its scheme is allowed. URLs need both.
 */
const DECODE_OPTS = { unknownFields: 'drop' } as const

function islandProps<S extends { [K: string]: unknown }>(
	shape: T.StructType<S>,
	props: Record<string, unknown>
): T.TypeOf<T.StructType<S>> | undefined {
	const decoded = T.decode(shape, props, DECODE_OPTS)
	return T.isOk(decoded) ? decoded.ok : undefined
}

// ============================================
// image — enhance
// ============================================

/**
 * The lightbox behind a published page's pictures.
 *
 * `enhance`, so nothing renders where the picture is: the `<figure>` and `<img>` are
 * the server's, and every mark left on them is restored on unmount.
 */
const tImageProps = T.struct({ src: T.optional(T.string), alt: T.optional(T.string) })

export function SiteImageIsland({ props }: SiteIslandProps) {
	const { t } = useTranslation()
	const container = useSiteIslandContainer()
	const [open, setOpen] = React.useState(false)
	const image = islandProps(tImageProps, props)
	const src = safeHref(image?.src)
	const alt = image?.alt

	React.useEffect(
		function enhanceServerImage() {
			const img = src ? container?.querySelector('img') : undefined
			if (!img) return

			const openLightbox = () => setOpen(true)
			const onKeyDown = (ev: KeyboardEvent) => {
				if (ev.key !== 'Enter' && ev.key !== ' ') return
				ev.preventDefault()
				setOpen(true)
			}

			const previous = {
				cursor: img.style.cursor,
				role: img.getAttribute('role'),
				tabIndex: img.getAttribute('tabindex')
			}
			img.style.cursor = 'zoom-in'
			img.setAttribute('role', 'button')
			img.setAttribute('tabindex', '0')
			img.addEventListener('click', openLightbox)
			img.addEventListener('keydown', onKeyDown)

			// The server painted this element: a content swap or a route change
			// has to find it exactly as it was published.
			return () => {
				img.removeEventListener('click', openLightbox)
				img.removeEventListener('keydown', onKeyDown)
				img.style.cursor = previous.cursor
				if (previous.role === null) img.removeAttribute('role')
				else img.setAttribute('role', previous.role)
				if (previous.tabIndex === null) img.removeAttribute('tabindex')
				else img.setAttribute('tabindex', previous.tabIndex)
			}
		},
		[container, src]
	)

	if (!src) return null
	return (
		<Lightbox
			open={open}
			close={() => setOpen(false)}
			slides={[{ src, alt: alt || t('Image') }]}
			plugins={[Fullscreen, Zoom]}
		/>
	)
}

// ============================================
// documentEmbed — replace
// ============================================

const tEmbedProps = T.struct({
	fileId: T.optional(T.string),
	name: T.optional(T.string),
	contentType: T.optional(T.string),
	navState: T.optional(T.string),
	sizing: T.optional(T.string),
	align: T.optional(T.string),
	// `unknown`, because `sitePositiveInt` coerces: a stored `"400"` still counts.
	height: T.optional(tAnyValue),
	maxH: T.optional(tAnyValue),
	lastW: T.optional(tAnyValue),
	lastH: T.optional(tAnyValue),
	scale: T.optional(tAnyValue),
	textScale: T.optional(tAnyValue)
})

/**
 * A live document inside a published page.
 *
 * The owner tenant is the node serving the page — `useApi()` resolves the idTag the
 * boot flow read from `/.well-known/cloudillo/id-tag`. Until it arrives the hook gets
 * `null` and the reader keeps the publisher's placeholder.
 */
function SiteDocumentEmbedIsland({ props }: SiteIslandProps) {
	const { api } = useApi()
	const embedProps = islandProps(tEmbedProps, props)
	const fileId = embedProps?.fileId ?? ''
	const contentType = embedProps?.contentType ?? ''
	const navState = embedProps?.navState
	// Same mapping as the Notillo block (`editor/DocumentEmbed.tsx`): the authored
	// legacy `height` stands in for `maxH`.
	// `width` is already applied to the placeholder box the island mounts into
	const settings = normalizeEmbedSettings(
		{
			sizing: embedProps?.sizing,
			align: embedProps?.align,
			scale: embedProps?.scale,
			maxH: sitePositiveInt(embedProps?.maxH) ?? sitePositiveInt(embedProps?.height),
			textScale: embedProps?.textScale,
			lastW: sitePositiveInt(embedProps?.lastW),
			lastH: sitePositiveInt(embedProps?.lastH)
		},
		'center'
	)
	// A published page has no expand/collapse to reset the mount with, so without this
	// a transient slow load needs a full reload to recover.
	const [attempt, setAttempt] = React.useState(0)

	const embed = useShellEmbed(
		api?.idTag && fileId && contentType
			? {
					resId: `${api.idTag}:${fileId}`,
					idTag: api.idTag,
					contentType,
					access: 'read',
					navState,
					version,
					retryKey: attempt,
					register: registerShellEmbed,
					release: releaseShellEmbed
				}
			: null
	)

	if (!embed.iframeSrc && embed.stage !== 'error') return null

	const retry = () => setAttempt((n) => n + 1)
	const live = !!embed.iframeSrc && embed.stage !== 'error'
	// `pos-relative`: the indicator overlays the embed box, and is the only status UI; with no
	// embed under it, the box needs a height of its own.
	return (
		<VBox className="w-100 pos-relative" style={live ? undefined : { minHeight: '6rem' }}>
			<AppLoadingIndicator
				stage={embed.stage}
				errorCode={embed.errorCode}
				errorMessage={embed.error}
				subtle={embed.stage === 'syncing'}
				onRetry={retry}
			/>
			{live && (
				<ViewEmbed
					// A fresh element per boot: the memoised iframe otherwise merely
					// navigates, leaving the pre-retry document's relay live to report
					// readiness against the new mount (see `useShellEmbed`).
					key={embed.iframeSrc}
					src={embed.iframeSrc}
					// 'live' as soon as there is a src: the bundle has to mount to report
					// ready. Unmounted on error — a bundle behind the opaque overlay is
					// invisible work, and its own retry loops keep running.
					status="live"
					// Unnamed (older) blocks fall back to ViewEmbed's "Embedded document"
					title={embedProps?.name}
					nav={navState}
					settings={settings}
					// A published page is read-only: nothing to edit in place, so the
					// embed is live from the first paint.
					canInteract={false}
					active
					onAppReady={embed.onAppReady}
					onAppError={embed.onAppError}
				/>
			)}
		</VBox>
	)
}

registerSiteIsland('image', SiteImageIsland)
registerSiteIsland('documentEmbed', SiteDocumentEmbedIsland)

// vim: ts=4
