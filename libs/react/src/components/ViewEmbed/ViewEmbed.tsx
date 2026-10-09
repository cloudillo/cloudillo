// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Embedded view composed of frame, chrome and placeholder. `ViewEmbed` takes a ready iframe
 * `src` and a status; `DocViewEmbed` requests the embed for a document itself.
 */

import { docRef, type EmbedViewReportPayload, getAppBus } from '@cloudillo/core'
import * as React from 'react'

import { useCopyEmbedLink } from '../../embed-source.js'
import { useLibTranslation } from '../../i18n.js'
import { useDocumentEmbed } from '../DocumentEmbed/index.js'
import { type EmbedActions, EmbedChrome } from './EmbedChrome.js'
import { EmbedPlaceholder, type EmbedStatus } from './EmbedPlaceholder.js'
import { type EmbedViewSettings, resizeSettings } from './sizing.js'
import { ViewEmbedFrame, type ViewEmbedFrameHandle } from './ViewEmbedFrame.js'

export interface ViewEmbedProps {
	/** Iframe src; required for `status: 'live'` */
	src?: string
	status: EmbedStatus
	/** Shown in the chip and placeholders until the source reports its own title */
	title?: string
	appId?: string
	owner?: string
	/** Stored view; a change after mount is sent to the source (`embed:view.set`) */
	nav?: string
	settings: EmbedViewSettings
	/** Frame size in `box` sizing mode */
	box?: { w: number; h: number }
	/** The viewer may edit the source in place (host decides) */
	canInteract: boolean
	/** Host keeps the embed in interact mode (e.g. presentation, active canvas document) */
	active?: boolean
	/** Host editor: the bar also shows while the host forces interact mode */
	canEdit?: boolean
	/** Host keeps the embed selected (e.g. a selected canvas object) */
	selected?: boolean
	actions?: EmbedActions
	onRetry?: () => void
	onRequestAccess?: () => void
	onLoadAnyway?: () => void
	onReport?: (report: EmbedViewReportPayload) => void
	onAppReady?: (stage?: string) => void
	onAppError?: (code: number, message?: string) => void
	/** The iframe document loaded; the app inside may still be booting */
	onFrameLoad?: () => void
	/** The app has not reported ready in time: an error overlay over the still-mounted iframe */
	stalled?: boolean
	className?: string
	/** Extra host controls in the chrome bar */
	children?: React.ReactNode
}

export function ViewEmbed({
	src,
	status,
	title: titleProp,
	appId,
	owner,
	nav,
	settings,
	box,
	canInteract,
	active: forceActive,
	canEdit = false,
	selected,
	actions = {},
	onRetry,
	onRequestAccess,
	onLoadAnyway,
	onReport,
	onAppReady,
	onAppError,
	onFrameLoad,
	stalled,
	className,
	children
}: ViewEmbedProps) {
	const { t } = useLibTranslation()
	const title = titleProp || t('Embedded document')
	const frameRef = React.useRef<ViewEmbedFrameHandle>(null)
	const [report, setReport] = React.useState<EmbedViewReportPayload>()
	const [active, setActive] = React.useState(false)

	const firstNav = React.useRef(true)
	React.useEffect(
		function sendNav() {
			if (firstNav.current) {
				firstNav.current = false
				return
			}
			frameRef.current?.setNav(nav)
		},
		[nav]
	)

	const handleReport = React.useCallback(
		(r: EmbedViewReportPayload) => {
			setReport(r)
			onReport?.(r)
		},
		[onReport]
	)

	const placeholderActions = {
		onRemove: actions.onRemove,
		onOpenSource: actions.onOpenSource
	}

	if (status !== 'live' || !src) {
		const lastNatural = settings.lastNatural
		const size =
			box ?? (lastNatural ? { w: lastNatural[0], h: lastNatural[1] } : { w: 0, h: 400 })
		return (
			<EmbedPlaceholder
				status={status === 'live' ? 'loading' : status}
				title={title}
				appId={appId}
				size={size}
				onRetry={onRetry}
				onRequestAccess={onRequestAccess}
				onLoadAnyway={onLoadAnyway}
				className={className}
				{...placeholderActions}
			/>
		)
	}

	const kind = report?.kind ?? 'fixed'
	const { onSizing } = actions
	const onResize = onSizing
		? (frameW: number, availW: number) => {
				const n = report?.natural ?? settings.lastNatural
				const natural = Array.isArray(n) ? { w: n[0], h: n[1] } : n
				onSizing(resizeSettings(settings, kind, natural, availW, frameW))
			}
		: undefined

	const resetView = () => {
		frameRef.current?.setNav(nav)
		actions.onResetView?.()
	}

	return (
		<ViewEmbedFrame
			ref={frameRef}
			src={src}
			settings={settings}
			box={box}
			label={report?.title || title}
			canInteract={canInteract}
			active={forceActive}
			onReport={handleReport}
			onAppReady={onAppReady}
			onAppError={onAppError}
			onFrameLoad={onFrameLoad}
			onActiveChange={setActive}
			onExitForced={actions.onDeactivate}
			selected={selected}
			canEdit={canEdit}
			resizable={!!onSizing && settings.sizing !== 'box'}
			onResize={onResize}
			onDelete={actions.onRemove}
			className={className}
		>
			{report?.missing && (
				// The frame stays mounted underneath so a later view change can recover it
				<div className="cl-view-embed-overlay">
					<EmbedPlaceholder
						status="missing"
						title={title}
						appId={appId}
						size={{ w: 0, h: 0 }}
						{...placeholderActions}
					/>
				</div>
			)}
			{stalled && (
				// Kept mounted too: a late 'synced' clears the overlay without a Retry
				<div className="cl-view-embed-overlay">
					<EmbedPlaceholder
						status="error"
						title={title}
						appId={appId}
						size={{ w: 0, h: 0 }}
						onRetry={onRetry}
						{...placeholderActions}
					/>
				</div>
			)}
			<EmbedChrome
				title={report?.title || title}
				appId={appId}
				owner={owner}
				drifted={report?.drifted}
				currentNav={report?.nav}
				actions={{ ...actions, onResetView: resetView }}
				kind={kind}
				settings={settings}
				active={forceActive || active}
				onInteract={canInteract ? () => frameRef.current?.activate() : actions.onActivate}
				onDone={forceActive ? actions.onDeactivate : () => frameRef.current?.deactivate()}
			>
				{children}
			</EmbedChrome>
		</ViewEmbedFrame>
	)
}

export interface DocViewEmbedProps
	extends Omit<ViewEmbedProps, 'src' | 'status' | 'onRetry' | 'stalled'> {
	fileId: string
	contentType: string
	sourceFileId: string
	access?: 'read' | 'comment' | 'write'
}

/** How long a loaded embed may stay silent before it counts as failed (as `shell-embed.ts`) */
export const EMBED_BOOT_TIMEOUT = 15000

/**
 * Requests the embed for a document (initial `nav` goes as `navState`) and renders it.
 * "Open source" and "Copy embed link" default to the stored view's `cl:` ref when `owner` is
 * known. A refused request, an app error, a silent app and being offline each get their own
 * placeholder; reconnecting retries.
 */
export function DocViewEmbed(props: DocViewEmbedProps) {
	const [attempt, setAttempt] = React.useState(0)
	const retry = React.useCallback(() => setAttempt((a) => a + 1), [])
	// A new key remounts the request hook, which is how Retry re-requests the embed
	return <DocViewEmbedInner key={attempt} {...props} onRetry={retry} />
}

function DocViewEmbedInner({
	fileId,
	contentType,
	sourceFileId,
	access,
	nav,
	onAppReady,
	onAppError,
	onFrameLoad,
	...props
}: DocViewEmbedProps & { onRetry: () => void }) {
	const copyLink = useCopyEmbedLink()
	const [appStatus, setAppStatus] = React.useState<EmbedStatus>()
	const [stalled, setStalled] = React.useState(false)
	const [offline, setOffline] = React.useState(
		() => typeof navigator !== 'undefined' && !navigator.onLine
	)
	const bootTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
	const embed = useDocumentEmbed(
		sourceFileId
			? {
					targetFileId: fileId,
					targetContentType: contentType,
					sourceFileId,
					access,
					navState: nav
				}
			: null
	)
	const requestStatus: EmbedStatus =
		embed.status === 'ready'
			? 'live'
			: embed.status === 'error'
				? embed.reason === 'nested'
					? 'nested'
					: 'error'
				: 'loading'
	const baseStatus = requestStatus === 'live' ? (appStatus ?? 'live') : requestStatus
	// Offline only replaces a not-yet-live state: a running embed keeps its own offline mode
	const status: EmbedStatus =
		offline && (baseStatus === 'loading' || baseStatus === 'error') ? 'offline' : baseStatus
	const retryOnline = status !== 'live' && status !== 'loading'

	const { onRetry } = props
	React.useEffect(
		function watchOnline() {
			const goOffline = () => setOffline(true)
			const goOnline = () => {
				setOffline(false)
				if (retryOnline) onRetry()
			}
			window.addEventListener('offline', goOffline)
			window.addEventListener('online', goOnline)
			return () => {
				window.removeEventListener('offline', goOffline)
				window.removeEventListener('online', goOnline)
			}
		},
		[retryOnline, onRetry]
	)

	React.useEffect(() => () => clearTimeout(bootTimer.current), [])

	// The app already reported ready or failed for this src: a late (or repeated) load event
	// must not arm the stall timer
	const settledRef = React.useRef(false)
	React.useEffect(() => {
		settledRef.current = false
	}, [embed.iframeSrc])

	// Started on iframe load, not on 'live': a lazy iframe below the fold loads much later
	const handleFrameLoad = React.useCallback(() => {
		clearTimeout(bootTimer.current)
		if (!settledRef.current) {
			bootTimer.current = setTimeout(() => setStalled(true), EMBED_BOOT_TIMEOUT)
		}
		onFrameLoad?.()
	}, [onFrameLoad])
	const handleAppReady = React.useCallback(
		(stage?: string) => {
			// Any stage settles it (as `shell-embed.ts`): the timeout only catches an app that
			// never speaks, and many apps report nothing past 'auth'
			settledRef.current = true
			clearTimeout(bootTimer.current)
			setStalled(false)
			onAppReady?.(stage)
		},
		[onAppReady]
	)
	const handleAppError = React.useCallback(
		(code: number, message?: string) => {
			settledRef.current = true
			clearTimeout(bootTimer.current)
			setStalled(false)
			setAppStatus(
				code === 4401 || code === 4403 ? 'no-access' : code === 4404 ? 'missing' : 'error'
			)
			onAppError?.(code, message)
		},
		[onAppError]
	)

	const { owner } = props
	const ref = owner
		? docRef(props.appId || contentType.replace(/^cloudillo\//, ''), `${owner}:${fileId}`, nav)
		: undefined
	const merged = ref
		? {
				onOpenSource: () => getAppBus().openDocument(ref),
				onCopyLink: () => copyLink(ref),
				...props.actions
			}
		: props.actions
	// An embedded host cannot grant (doc:grant.req is neither allowed nor relayed for embeds),
	// so the toggle would only wait out the request timeout
	let actions = merged
	if (merged && getAppBus().embedded) {
		const { editable: _e, onEditableChange: _c, ...rest } = merged
		actions = rest
	}

	return (
		<ViewEmbed
			{...props}
			actions={actions}
			src={embed.iframeSrc}
			status={status}
			nav={nav}
			onAppReady={handleAppReady}
			onAppError={handleAppError}
			onFrameLoad={handleFrameLoad}
			stalled={stalled}
		/>
	)
}

// vim: ts=4
