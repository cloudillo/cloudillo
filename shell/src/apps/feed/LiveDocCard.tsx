// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * A live collaborative document shared as a feed post (`POST` / `LDOC`).
 *
 * Collapsed — the default — nothing is materialized: one `api.files.list({ fileId })`
 * for the title, no iframe, no CRDT/RTDB socket, no blob fetch. Clicking mounts the
 * real app **inside the card**, so the reader keeps their feed scroll position.
 */

import { Button, DocumentEmbedIframe, useApi } from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuExternalLink as IcExternal } from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'

import { shellEmbedAppName } from '../../app-name.js'
import {
	activeContextAtom,
	useContextAwareApi,
	useCtx,
	useProfileTrust
} from '../../context/index.js'
import { getIcon } from '../../icon-registry.js'
import { getHandlersForContentType } from '../../manifest-registry.js'
import { TrustBanner } from '../../profile/TrustBanner.js'
import { appPath } from '../../routes.js'
import { registerShellEmbed, releaseShellEmbed, useShellEmbed } from '../../shell-embed.js'
import { AppLoadingIndicator } from '../AppLoadingIndicator.js'
import { fetchRow } from '../doc-info.js'
import { isSameDoc, type LiveDocRef } from './live-doc.js'

export interface LiveDocCardProps {
	docRef: LiveDocRef
	/** Width budget of the surrounding post, as the other media components take it. */
	width?: number
	/** Quote insets never mount an iframe — collapsed is the only state they have. */
	collapsedOnly?: boolean
	className?: string
}

/** Starting height of the expanded box. A text document has no aspect ratio. */
const DEFAULT_EMBED_HEIGHT = 24 * 16
const HEIGHT_STEP = 8 * 16
const MAX_EMBED_HEIGHT = 80 * 16

export function LiveDocCard({ docRef, width, collapsedOnly, className }: LiveDocCardProps) {
	const { t } = useTranslation()
	// The document is served by the node the reader is *browsing*, which is the community
	// in a community feed — `useApi()` is always the user's own node.
	const { api } = useContextAwareApi()
	// The app *bundle*, unlike the document, is a static asset of our own node.
	const { api: homeApi } = useApi()
	const ctx = useCtx()
	const navigate = useNavigate()
	const [expanded, setExpanded] = React.useState(false)
	const [height, setHeight] = React.useState(DEFAULT_EMBED_HEIGHT)
	const [attempt, setAttempt] = React.useState(0)
	const [rowTitle, setRowTitle] = React.useState<string | undefined>(undefined)

	/*
	 * The token this card mints identifies the reader to `srcIdTag`, and that idTag came
	 * out of a federated post body — one click would otherwise hand an attacker-chosen node
	 * an identified request. Same authority the passive-read gate uses everywhere else
	 * (`shell/src/context/trust.ts`): `isAuthenticatedFor` covers the user's own node, a
	 * session 'S' and a stored 'always'; the active context is consent too — it was entered
	 * by an explicit switch or join — and `effectiveTrust` says so, but only the hook's
	 * atoms re-render this card when a decision lands.
	 */
	const { isAuthenticatedFor, getEffectiveTrust } = useProfileTrust()
	const activeContext = useAtomValue(activeContextAtom)
	const trusted = docRef.srcIdTag === activeContext?.idTag || isAuthenticatedFor(docRef.srcIdTag)
	const trustDecided = getEffectiveTrust(docRef.srcIdTag) !== null

	const manifest = getHandlersForContentType(docRef.contentType)[0]?.manifest
	const AppIcon = getIcon(manifest?.icon)
	const appId = shellEmbedAppName(docRef.contentType)

	// One file row, and only for the title — and only once the reader opens the card.
	// The collapsed title travelled with the post, and a feed of N cards must not cost
	// N `files.list` calls for a cosmetic refresh, most of which 404 anyway because a
	// federated document has no row on this node. `fetchRow` tells "no such row" apart
	// from "nobody answered"; either way `docRef.title` is the fallback, so both stay
	// silent. `useDocInfo` is deliberately NOT mounted: it would rewrite the tab title.
	React.useEffect(() => {
		if (!expanded) return
		let live = true
		fetchRow(api, docRef.fileId).then((res) => {
			// Only a row that IS this document may override the title the post carries:
			// fileIds are node-local, so a foreign document's id can hit an unrelated
			// local row, whose name would then be rendered over the post's own title.
			if (live && isSameDoc(res.row, docRef, api?.idTag)) setRowTitle(res.row?.fileName)
		})
		return () => {
			live = false
		}
	}, [api, docRef, expanded])

	// `null` while untrusted: nothing registers, so nothing mints.
	const embed = useShellEmbed(
		expanded && trusted && homeApi?.idTag
			? {
					resId: docRef.doc,
					idTag: homeApi.idTag,
					contentType: docRef.contentType,
					// Editing happens on the full page. Always.
					access: 'read',
					retryKey: attempt,
					register: registerShellEmbed,
					release: releaseShellEmbed
				}
			: null
	)

	const title = rowTitle ?? docRef.title ?? docRef.fileId
	const typeLabel = manifest ? t('{{app}} document', { app: manifest.name }) : t('document')
	const expandLabel = expanded ? t('Collapse') : t('Open document')
	// The visible text stays put so a card does not reflow when `apiAtom` lands; the reason
	// rides on the accessible name and the tooltip instead.
	const expandBlocked = !expanded && !homeApi?.idTag
	const expandTitle = expandBlocked
		? t('{{action}} — still starting up, try again in a moment', { action: expandLabel })
		: expandLabel

	return (
		<div
			className={className ?? 'c-live-doc-card'}
			style={width ? { maxWidth: width } : undefined}
		>
			<div className="c-live-doc-head c-hbox align-items-center g-2">
				<span className="c-live-doc-icon">{AppIcon ? <AppIcon /> : null}</span>
				<div className="c-vbox flex-fill">
					<span className="c-live-doc-title">{title}</span>
					<span className="c-live-doc-meta">
						{typeLabel} · {docRef.srcIdTag}
					</span>
				</div>
				{!collapsedOnly && (
					<Button
						kind="link"
						variant="primary"
						// Expanding needs our own idTag for the bundle URL, and `useApi()`
						// has none until boot writes `apiAtom`; without it `useShellEmbed`
						// parks at 'connecting' with no boot timer — a spinner that never
						// times out. Collapsing needs nothing, so a card stays closable if
						// `apiAtom` clears while it is open. `aria-disabled`, like the
						// sibling button: a `disabled` button takes no focus, and
						// `.c-live-doc-head [aria-disabled='true']` in `feed.css` dims it.
						onClick={() => {
							if (expandBlocked) return
							setExpanded(!expanded)
						}}
						aria-disabled={expandBlocked}
						aria-expanded={expanded}
						title={expandTitle}
						aria-label={expandTitle}
					>
						{expandLabel}
					</Button>
				)}
				{/* A collapsed-only card has no expand button, so an untrusted node's TrustBanner is
				    unreachable from here: render nothing rather than a control that can never enable. */}
				{(trusted || !collapsedOnly) && (
					<Button
						kind="link"
						// The reader stays in their own context; only the resId names the node
						// that serves the document — exactly how the Files app opens a
						// mirrored row. `@<idTag>` would be a community the reader may not
						// even be a member of.
						onClick={() => {
							if (!trusted) return
							navigate(appPath(ctx.base, appId, docRef.doc))
						}}
						// The full page mints the same identified token this card does.
						// `aria-disabled`, not `disabled`: the reason below is the ONLY place
						// it is stated, and a `disabled` button takes no focus, so a keyboard
						// user could never reach it.
						aria-disabled={!trusted}
						title={
							trusted
								? t('Open on its own page')
								: t('Decide whether to identify yourself to {{idTag}} first', {
										idTag: docRef.srcIdTag
									})
						}
						aria-label={
							trusted
								? t('Open on its own page')
								: t('Decide whether to identify yourself to {{idTag}} first', {
										idTag: docRef.srcIdTag
									})
						}
						icon={<IcExternal />}
					/>
				)}
			</div>
			{/* Not rendered at all while collapsed: `active` only toggles
			    pointerEvents — the iframe would still load. */}
			{expanded && !collapsedOnly && !trusted && (
				<div className="c-live-doc-embed">
					<TrustBanner idTag={docRef.srcIdTag} />
					{trustDecided && (
						<p className="c-alert info m-2" role="status">
							{t('This document cannot be opened anonymously.')}
						</p>
					)}
				</div>
			)}
			{expanded && !collapsedOnly && trusted && (
				// `pos-relative`: the indicator is an opaque full-box overlay.
				<div className="c-live-doc-embed pos-relative" style={{ height }}>
					<AppLoadingIndicator
						stage={embed.stage}
						errorCode={embed.errorCode}
						errorMessage={embed.error}
						subtle={embed.stage === 'syncing'}
						onRetry={() => setAttempt((n) => n + 1)}
					/>
					{/* Dropped on error: the overlay is opaque, so a mounted bundle behind it
					    is invisible work — and its own retry loops keep running. */}
					{embed.iframeSrc && embed.stage !== 'error' && (
						<DocumentEmbedIframe
							// A fresh element per boot: the memoised iframe otherwise merely
							// navigates, leaving the pre-retry document's relay live to report
							// readiness against the new mount (see `useShellEmbed`).
							key={embed.iframeSrc}
							src={embed.iframeSrc}
							className="w-100 h-100 border-0"
							active
							onAppReady={embed.onAppReady}
							onAppError={embed.onAppError}
						/>
					)}
				</div>
			)}
			{expanded && !collapsedOnly && trusted && (
				<div className="c-hbox g-2">
					{height < MAX_EMBED_HEIGHT && (
						<Button
							kind="link"
							size="small"
							onClick={() =>
								setHeight(Math.min(height + HEIGHT_STEP, MAX_EMBED_HEIGHT))
							}
						>
							{t('Taller')}
						</Button>
					)}
					{height > DEFAULT_EMBED_HEIGHT && (
						<Button
							kind="link"
							size="small"
							onClick={() =>
								setHeight(Math.max(height - HEIGHT_STEP, DEFAULT_EMBED_HEIGHT))
							}
						>
							{t('Shorter')}
						</Button>
					)}
				</div>
			)}
		</div>
	)
}

// vim: ts=4
