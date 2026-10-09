// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Renders a sandboxed iframe for an embedded document and manages the embed relay.
 */

import {
	APP_SANDBOX,
	type EmbedRelayHandle,
	type EmbedViewLayoutPayload,
	type EmbedViewReportPayload,
	setupEmbedRelay
} from '@cloudillo/core'
import * as React from 'react'

export interface DocumentEmbedIframeProps {
	src: string
	className?: string
	active?: boolean
	/** The iframe document loaded; the app inside may still be booting */
	onLoad?: () => void
	/** The embedded app asked to leave interact mode (`embed:view.exit`, i.e. Esc) */
	onExit?: () => void
	/** The embedded app reported a loading stage (`app:ready.notify`). */
	onAppReady?: (stage?: string) => void
	/** The embedded app reported a fatal error (`app:error.notify`), e.g. 4403 = access denied. */
	onAppError?: (code: number, message?: string) => void
	/** The embedded app reported its view (`embed:view.report`). */
	onViewReport?: (report: EmbedViewReportPayload) => void
}

export interface DocumentEmbedIframeRef {
	/** Send the host layout to the embedded app (`embed:view.layout`) */
	sendLayout: (layout: EmbedViewLayoutPayload) => void
	/** Ask the embedded app to show a view (`embed:view.set`) */
	sendViewSet: (nav?: string) => void
	/** Move keyboard focus into the embedded app */
	focus: () => void
}

export const DocumentEmbedIframe = React.memo(
	React.forwardRef<DocumentEmbedIframeRef, DocumentEmbedIframeProps>(function DocumentEmbedIframe(
		{ src, className, active, onLoad, onExit, onAppReady, onAppError, onViewReport },
		ref
	) {
		const iframeRef = React.useRef<HTMLIFrameElement | null>(null)
		const relayRef = React.useRef<EmbedRelayHandle | null>(null)
		const cleanupRef = React.useRef<(() => void) | null>(null)
		// Kept in refs: `setIframeRef` is a `useCallback([])`.
		const onAppReadyRef = React.useRef(onAppReady)
		onAppReadyRef.current = onAppReady
		const onAppErrorRef = React.useRef(onAppError)
		onAppErrorRef.current = onAppError
		const onViewReportRef = React.useRef(onViewReport)
		onViewReportRef.current = onViewReport
		const onExitRef = React.useRef(onExit)
		onExitRef.current = onExit

		React.useImperativeHandle(
			ref,
			() => ({
				sendLayout: (layout: EmbedViewLayoutPayload) => {
					relayRef.current?.sendToChild('embed:view.layout', layout)
				},
				sendViewSet: (nav?: string) => {
					relayRef.current?.sendToChild('embed:view.set', { nav })
				},
				focus: () => iframeRef.current?.focus()
			}),
			[]
		)

		// Set up embed relay when iframe mounts
		const setIframeRef = React.useCallback((el: HTMLIFrameElement | null) => {
			// Clean up previous relay
			if (cleanupRef.current) {
				cleanupRef.current()
				cleanupRef.current = null
				relayRef.current = null
			}

			iframeRef.current = el

			if (el) {
				const relay = setupEmbedRelay(el, {
					onChildNotification: (type, payload) => {
						if (type === 'app:ready.notify') {
							onAppReadyRef.current?.(
								(payload as { stage?: string } | undefined)?.stage
							)
							return
						}
						if (type === 'app:error.notify') {
							const p = payload as { code?: unknown; message?: unknown } | undefined
							if (typeof p?.code === 'number') {
								onAppErrorRef.current?.(
									p.code,
									typeof p.message === 'string' ? p.message : undefined
								)
							}
							return
						}
						if (type === 'embed:view.exit') {
							onExitRef.current?.()
							return
						}
						if (type === 'embed:view.report' && payload) {
							onViewReportRef.current?.(payload as EmbedViewReportPayload)
						}
					}
				})
				relayRef.current = relay
				cleanupRef.current = relay.cleanup
			}
		}, [])

		// Clean up on unmount
		React.useEffect(() => {
			return () => {
				if (cleanupRef.current) {
					cleanupRef.current()
					cleanupRef.current = null
					relayRef.current = null
				}
			}
		}, [])

		return (
			<iframe
				ref={setIframeRef}
				src={src}
				className={className}
				sandbox={APP_SANDBOX}
				loading="lazy"
				// Inactive: the embed's container is its single tab stop
				tabIndex={active ? undefined : -1}
				style={{ pointerEvents: active ? 'auto' : 'none' }}
				onLoad={onLoad}
			/>
		)
	})
)

// vim: ts=4
