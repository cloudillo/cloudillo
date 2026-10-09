// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * A live collaborative document shared as a feed post (`POST` / `LDOC`).
 *
 * Collapsed — the default — nothing is materialized: one `api.files.list({ fileId })`
 * for the title, no iframe, no CRDT/RTDB socket, no blob fetch. Clicking mounts the
 * real app **inside the card**, so the reader keeps their feed scroll position.
 */

import type { EmbedViewReportPayload } from '@cloudillo/core'
import {
	Alert,
	Button,
	Card,
	FileTypeIcon,
	HBox,
	Meta,
	Text,
	useApi,
	VBox,
	ViewEmbed
} from '@cloudillo/react'
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
import { getHandlersForContentType } from '../../manifest-registry.js'
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

/** Reflowing documents are clipped here until the reader asks for "Show more". */
const MAX_EMBED_HEIGHT = 640

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
	const [showAll, setShowAll] = React.useState(false)
	const [report, setReport] = React.useState<EmbedViewReportPayload>()
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
	const { isAuthenticatedFor, getEffectiveTrust, setSessionTrust } = useProfileTrust()
	const activeContext = useAtomValue(activeContextAtom)
	const trusted = docRef.srcIdTag === activeContext?.idTag || isAuthenticatedFor(docRef.srcIdTag)
	const trustDecided = getEffectiveTrust(docRef.srcIdTag) !== null

	const manifest = getHandlersForContentType(docRef.contentType)[0]?.manifest
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
					navState: docRef.nav,
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
	// The visible text stays put so a card does not reflow when `apiAtom` lands.
	const expandBlocked = !expanded && !homeApi?.idTag

	return (
		<Card
			variant="outline"
			padding={2}
			className={className}
			style={width ? { maxWidth: width } : undefined}
		>
			<VBox gap={2}>
				<HBox align="center" gap={2}>
					<FileTypeIcon contentType={docRef.contentType} size="md" />
					<VBox className="flex-fill" style={{ minWidth: 0 }}>
						<Text weight="semibold" truncate>
							{title}
						</Text>
						<Text size="sm" emphasis="muted" truncate>
							<Meta>
								{typeLabel}
								{docRef.srcIdTag}
							</Meta>
						</Text>
					</VBox>
					{!collapsedOnly && (
						<Button
							variant="link"
							color="primary"
							// Expanding needs our own idTag for the bundle URL, and `useApi()`
							// has none until boot writes `apiAtom`; without it `useShellEmbed`
							// parks at 'connecting' with no boot timer — a spinner that never
							// times out. Collapsing needs nothing, so a card stays closable if
							// `apiAtom` clears while it is open. `disabledReason` keeps it
							// focusable and states why.
							onClick={() => {
								if (expandBlocked) return
								setExpanded(!expanded)
							}}
							disabledReason={
								expandBlocked
									? t('Still starting up, try again in a moment')
									: undefined
							}
							aria-expanded={expanded}
						>
							{expandLabel}
						</Button>
					)}
					{/* A collapsed-only card has no expand button, so an untrusted node's trust prompt is
					    unreachable from here: render nothing rather than a control that can never enable. */}
					{(trusted || !collapsedOnly) && (
						<Button
							variant="link"
							// The reader stays in their own context; only the resId names the node
							// that serves the document — exactly how the Files app opens a
							// mirrored row. `@<idTag>` would be a community the reader may not
							// even be a member of.
							onClick={() => {
								if (!trusted) return
								navigate(appPath(ctx.base, appId, docRef.doc))
							}}
							// The full page mints the same identified token this card does.
							// `disabledReason`, not `disabled`: the reason is the ONLY place it
							// is stated, and a `disabled` button takes no focus.
							disabledReason={
								trusted
									? undefined
									: t('Decide whether to identify yourself to {{idTag}} first', {
											idTag: docRef.srcIdTag
										})
							}
							aria-label={t('Open on its own page')}
							icon={<IcExternal />}
						/>
					)}
				</HBox>
				{/* Not rendered at all while collapsed — the iframe would still load.
				    "Load anyway" is the TrustBanner's "This session": the narrowest consent
				    that identifies the reader. */}
				{expanded && !collapsedOnly && !trusted && !trustDecided && (
					<ViewEmbed
						status="untrusted"
						title={title}
						appId={appId}
						settings={{ sizing: 'fit-width' }}
						canInteract={false}
						onLoadAnyway={() => setSessionTrust(docRef.srcIdTag, 'S')}
					/>
				)}
				{expanded && !collapsedOnly && !trusted && trustDecided && (
					<Alert compact>{t('This document cannot be opened anonymously.')}</Alert>
				)}
				{expanded && !collapsedOnly && trusted && (
					// `pos-relative`: the indicator is an opaque full-box overlay, and the only
					// status UI; with no embed under it, the box needs a height of its own.
					<VBox
						className="pos-relative"
						style={
							embed.iframeSrc && embed.stage !== 'error'
								? undefined
								: { minHeight: '6rem' }
						}
					>
						<AppLoadingIndicator
							stage={embed.stage}
							errorCode={embed.errorCode}
							errorMessage={embed.error}
							subtle={embed.stage === 'syncing'}
							onRetry={() => setAttempt((n) => n + 1)}
						/>
						{embed.iframeSrc && embed.stage !== 'error' && (
							<ViewEmbed
								// A fresh element per boot: the memoised iframe otherwise merely
								// navigates, leaving the pre-retry document's relay live to report
								// readiness against the new mount (see `useShellEmbed`).
								key={embed.iframeSrc}
								src={embed.iframeSrc}
								// 'live' as soon as there is a src: the bundle has to mount to
								// report ready. Unmounted on error — a bundle behind the opaque
								// overlay is invisible work, and its own retry loops keep running.
								status="live"
								title={title}
								appId={appId}
								nav={docRef.nav}
								settings={{
									sizing: 'fit-width',
									maxH: showAll ? undefined : MAX_EMBED_HEIGHT
								}}
								// Editing happens on the full page. Always. Live (scrollable,
								// clickable) from the first paint all the same.
								canInteract={false}
								active
								onReport={setReport}
								onAppReady={embed.onAppReady}
								onAppError={embed.onAppError}
							/>
						)}
					</VBox>
				)}
				{expanded &&
					!collapsedOnly &&
					trusted &&
					report?.kind === 'reflow' &&
					report.natural.h > MAX_EMBED_HEIGHT && (
						<Button variant="link" size="sm" onClick={() => setShowAll(!showAll)}>
							{showAll ? t('Show less') : t('Show more')}
						</Button>
					)}
			</VBox>
		</Card>
	)
}

// vim: ts=4
