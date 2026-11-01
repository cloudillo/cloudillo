// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Hook for managing presentation mode state
 */

import { getAppBus, getJwtTimes } from '@cloudillo/core'
import type { ToastOptions } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import type { PresenterInfo } from '../awareness'
import { encode, PRESENTATION_ID_KEY, type PresentationMsg } from '../presentation-channel'
import type { UsePrezilloDocumentResult } from './usePrezilloDocument'

/** The slice of the Presentation API the controller uses (not in TS's DOM lib) */
interface CastConnection extends EventTarget {
	readonly id: string
	readonly state: 'connecting' | 'connected' | 'closed' | 'terminated'
	send(data: string): void
	terminate(): void
}
interface CastRequest {
	start(): Promise<CastConnection>
	reconnect(id: string): Promise<CastConnection>
	getAvailability(): Promise<{ value: boolean; onchange: (() => void) | null }>
}

/** Request for the receiver page next to this app's `index.html`; null without the API */
function castRequest(): CastRequest | null {
	const Ctor = (window as Window & { PresentationRequest?: new (urls: string[]) => CastRequest })
		.PresentationRequest
	return Ctor ? new Ctor([new URL('receiver.html', location.href).href]) : null
}

/** Per document: the tab may open another deck, whose reload must not reattach this one's receiver */
const castIdKey = (fileId: string) => `${PRESENTATION_ID_KEY}:${fileId}`

function storeCastId(fileId: string | undefined, id: string | null) {
	if (!fileId) return
	try {
		if (id) sessionStorage.setItem(castIdKey(fileId), id)
		else sessionStorage.removeItem(castIdKey(fileId))
	} catch {
		// storage blocked: no reconnect after a reload
	}
}

/** setTimeout overflows above this and fires immediately */
const MAX_TIMEOUT = 2_147_483_647
/** Token rotation period when the token carries neither `exp` nor a lifetime */
const FALLBACK_TOKEN_ROTATE_MS = 5 * 60_000

export interface UsePresentationModeOptions {
	prezillo: UsePrezilloDocumentResult
	// Toast function for notifications
	toast: (options: ToastOptions) => string
}

export interface UsePresentationModeResult {
	// State
	isPresentationMode: boolean
	presentationFullscreen: boolean
	/** "Present with notes" was chosen */
	presentationWithNotes: boolean
	/** Presenter popup opened by the start click, or null (blocked, mobile, plain present) */
	presenterWindow: Window | null
	isFullscreenFollowing: boolean
	followedPresenter: PresenterInfo | null
	/** Sends to the Presentation API receiver; null while no receiver is initialised */
	castSend: ((msg: PresentationMsg) => void) | null

	// Handlers
	handleStartPresenting: (
		fullscreen?: boolean,
		withNotes?: boolean,
		presenterWindow?: Window | null
	) => void
	/**
	 * "Present on…": opens the browser's display picker; call synchronously in the click.
	 * Undefined while the browser reports no display to present on.
	 */
	handlePresentOn?: () => void
	handleStopPresenting: () => void
	handleExitFullscreenFollowing: () => void
}

export function usePresentationMode({
	prezillo,
	toast
}: UsePresentationModeOptions): UsePresentationModeResult {
	const { t } = useTranslation()
	// Presentation mode state (local user is presenting)
	const [isPresentationMode, setIsPresentationMode] = React.useState(false)
	const [presentationFullscreen, setPresentationFullscreen] = React.useState(false)
	const [presentationWithNotes, setPresentationWithNotes] = React.useState(false)
	const [presenterWindow, setPresenterWindow] = React.useState<Window | null>(null)

	// Presentation API session; ready once the receiver got its `init`
	const [cast, setCast] = React.useState<CastConnection | null>(null)
	const [castReady, setCastReady] = React.useState(false)
	const castRef = React.useRef<CastConnection | null>(null)
	castRef.current = cast

	// Fullscreen following mode (when following presenter in fullscreen)
	const [isFullscreenFollowing, setIsFullscreenFollowing] = React.useState(false)

	// Track previous presenters to detect new ones
	const prevPresentersRef = React.useRef<Set<number>>(new Set())

	// Show toast when a new presenter starts
	React.useEffect(() => {
		const currentIds = new Set(prezillo.activePresenters.map((p) => p.clientId))
		const prevIds = prevPresentersRef.current
		const localClientId = prezillo.awareness?.clientID

		// Find new presenters (excluding local client)
		for (const presenter of prezillo.activePresenters) {
			if (!prevIds.has(presenter.clientId) && presenter.clientId !== localClientId) {
				toast({
					variant: 'info',
					title: t('{{name}} started presenting', { name: presenter.user.name }),
					duration: 4000,
					actions: (
						<button
							className="c-button primary sm"
							onClick={() => prezillo.followPresenter(presenter.clientId)}
						>
							{t('Follow')}
						</button>
					)
				})
			}
		}

		prevPresentersRef.current = currentIds
	}, [
		prezillo.activePresenters,
		prezillo.awareness?.clientID,
		prezillo.followPresenter,
		toast,
		t
	])

	// Get presenter being followed
	const followedPresenter = React.useMemo(() => {
		if (!prezillo.followingClientId) return null
		return (
			prezillo.activePresenters.find((p) => p.clientId === prezillo.followingClientId) ?? null
		)
	}, [prezillo.followingClientId, prezillo.activePresenters])

	// Auto-enter fullscreen when starting to follow
	React.useEffect(() => {
		if (prezillo.followingClientId && !isFullscreenFollowing) {
			setIsFullscreenFollowing(true)
		} else if (!prezillo.followingClientId && isFullscreenFollowing) {
			setIsFullscreenFollowing(false)
		}
	}, [prezillo.followingClientId, isFullscreenFollowing])

	// Handle exiting fullscreen following mode
	const handleExitFullscreenFollowing = React.useCallback(() => {
		setIsFullscreenFollowing(false)
		prezillo.unfollowPresenter()
	}, [prezillo.unfollowPresenter])

	// Handle starting presentation (windowed by default, fullscreen optional)
	const handleStartPresenting = React.useCallback(
		(fullscreen?: boolean, withNotes?: boolean, win?: Window | null) => {
			prezillo.startPresenting()
			setPresentationFullscreen(fullscreen ?? false)
			setPresentationWithNotes(withNotes ?? false)
			setPresenterWindow(win ?? null)
			setIsPresentationMode(true)
		},
		[prezillo.startPresenting]
	)

	const ownerIdTag = prezillo.cloudillo.ownerTag
	const fileId = prezillo.cloudillo.fileId

	// A started or reattached session: present windowed, the iframe shows the presenter layout
	const adoptCast = React.useCallback(
		(conn: CastConnection) => {
			storeCastId(fileId, conn.id)
			setCast(conn)
			// Keep an open presenter popup tracked, so stopping still closes it
			handleStartPresenting(false, presentationWithNotes, presenterWindow)
		},
		[handleStartPresenting, fileId, presentationWithNotes, presenterWindow]
	)

	// Without a display, Chrome rejects start() with "No screens found" and shows no picker
	const [presentOnAvailable, setPresentOnAvailable] = React.useState(false)
	React.useEffect(() => {
		let alive = true
		let avail: { value: boolean; onchange: (() => void) | null } | undefined
		castRequest()
			?.getAvailability()
			.then(
				(a) => {
					if (!alive) return
					avail = a
					setPresentOnAvailable(a.value)
					a.onchange = () => setPresentOnAvailable(a.value)
				},
				// NotSupportedError: the browser can't monitor displays, so let the user try
				() => alive && setPresentOnAvailable(true)
			)
		return () => {
			alive = false
			if (avail) avail.onchange = null
		}
	}, [])

	const handlePresentOn = React.useCallback(() => {
		// start() needs the click's user activation: nothing may be awaited before it
		castRequest()
			?.start()
			.then(adoptCast, (err) => {
				// The user closed the picker
				if (err?.name === 'AbortError') return
				console.warn('[prezillo] presentation not started:', err)
				toast({
					variant: 'error',
					title:
						err?.name === 'NotFoundError'
							? t('No display or Cast device found')
							: t('Could not start the presentation')
				})
			})
	}, [adoptCast, toast, t])

	// After a presenter reload, reattach to the receiver that is still running (once)
	const reconnectTriedRef = React.useRef(false)
	React.useEffect(() => {
		if (!prezillo.cloudillo.synced || !fileId || reconnectTriedRef.current) return
		reconnectTriedRef.current = true
		let id: string | null = null
		try {
			id = sessionStorage.getItem(castIdKey(fileId))
		} catch {
			// storage blocked
		}
		if (!id) return
		castRequest()
			?.reconnect(id)
			.then(adoptCast, () => storeCastId(fileId, null))
	}, [prezillo.cloudillo.synced, fileId, adoptCast])

	// Latest `handleStopPresenting` (defined below), for the receiver-side terminate
	const stopRef = React.useRef<() => void>(() => {})

	// On every connect: send `init` with a fresh read-only token, rotate it at ~80% of its life
	React.useEffect(() => {
		if (!cast) return
		let alive = true
		let timer: ReturnType<typeof setTimeout> | undefined
		// Bumped per connect: a token request still in flight from an earlier connect must
		// not start a second rotation chain
		let gen = 0

		const sendToken = async (first: boolean, attempt = 0) => {
			const g = gen
			let res: { token: string; tokenLifetime?: number } | undefined
			try {
				res = await getAppBus().requestReadToken()
			} catch (err) {
				console.warn('[prezillo] read token request failed:', err)
			}
			if (!alive || g !== gen || cast.state !== 'connected') return
			if (!res || !ownerIdTag || !fileId) {
				if (first) {
					toast({
						variant: 'error',
						title: t('Could not start the presentation on that display')
					})
					cast.terminate()
				} else {
					// Rotation failed: retry with backoff before the receiver's token runs out
					timer = setTimeout(
						() => sendToken(false, attempt + 1),
						Math.min(5_000 * 2 ** attempt, 5 * 60_000)
					)
				}
				return
			}
			cast.send(
				encode(
					first
						? { type: 'init', token: res.token, ownerIdTag, fileId }
						: { type: 'token', token: res.token }
				)
			)
			if (first) setCastReady(true)
			// Same schedule as the shell's scoped tokens (SharedFolderView); lifetime in seconds
			// Neither `exp` nor a lifetime: rotate on a fixed schedule rather than never
			const exp = getJwtTimes(res.token)?.exp
			const remaining = exp
				? exp - Date.now()
				: res.tokenLifetime
					? res.tokenLifetime * 1000
					: FALLBACK_TOKEN_ROTATE_MS
			timer = setTimeout(
				() => sendToken(false),
				Math.min(Math.max(remaining * 0.8, 5_000), MAX_TIMEOUT)
			)
		}

		const onConnect = () => {
			gen++
			clearTimeout(timer)
			sendToken(true)
		}
		// Closed: the session leaves the UI, the id stays so a reload can still reattach
		const onClose = () => setCast(null)
		// Terminated (e.g. the browser's "Stop casting"): leave presentation mode entirely
		const onTerminate = () => {
			storeCastId(fileId, null)
			stopRef.current()
		}
		cast.addEventListener('connect', onConnect)
		cast.addEventListener('close', onClose)
		cast.addEventListener('terminate', onTerminate)
		if (cast.state === 'connected') onConnect()
		return () => {
			alive = false
			clearTimeout(timer)
			cast.removeEventListener('connect', onConnect)
			cast.removeEventListener('close', onClose)
			cast.removeEventListener('terminate', onTerminate)
			setCastReady(false)
		}
	}, [cast, ownerIdTag, fileId, toast, t])

	const castSend = React.useMemo(
		() =>
			cast && castReady
				? (msg: PresentationMsg) => {
						if (cast.state === 'connected') cast.send(encode(msg))
					}
				: null,
		[cast, castReady]
	)

	// Handle stopping presentation (closes the presenter popup, ends the receiver session)
	const handleStopPresenting = React.useCallback(() => {
		prezillo.stopPresenting()
		setIsPresentationMode(false)
		setPresentationFullscreen(false)
		setPresentationWithNotes(false)
		setPresenterWindow((win) => {
			win?.close()
			return null
		})
		const conn = castRef.current
		if (conn) {
			try {
				if (conn.state === 'connected') conn.send(encode({ type: 'end' }))
				conn.terminate()
			} catch (err) {
				console.warn('[prezillo] presentation terminate failed:', err)
			}
			setCast(null)
		} else if (fileId) {
			// The connection closed (onClose keeps the id for a reload): reattach to end it
			let id: string | null = null
			try {
				id = sessionStorage.getItem(castIdKey(fileId))
			} catch {
				// storage blocked
			}
			if (id) {
				castRequest()
					?.reconnect(id)
					.then(
						(c) => {
							if (c.state === 'connected') c.send(encode({ type: 'end' }))
							c.terminate()
						},
						() => {}
					)
			}
		}
		storeCastId(fileId, null)
	}, [prezillo.stopPresenting, fileId])
	stopRef.current = handleStopPresenting

	return {
		isPresentationMode,
		presentationFullscreen,
		presentationWithNotes,
		presenterWindow,
		isFullscreenFollowing,
		followedPresenter,
		castSend,
		handleStartPresenting,
		handlePresentOn: presentOnAvailable ? handlePresentOn : undefined,
		handleStopPresenting,
		handleExitFullscreenFollowing
	}
}

// vim: ts=4
