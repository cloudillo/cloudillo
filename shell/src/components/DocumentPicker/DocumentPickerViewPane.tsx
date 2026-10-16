// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The document picker's "Choose a view" pane: boots the picked file's app inside the
 * dialog in `pick-view` mode (read-only, free navigation) and confirms whatever view
 * the source last reported (`embed:view.report`). The selection is the source's; the
 * confirm is the shell's — no source-side confirm message exists.
 */

import type { EmbedViewReportPayload } from '@cloudillo/core'
import {
	ActionBar,
	Button,
	Dialog,
	IcDocument,
	Text,
	useApi,
	VBox,
	ViewEmbed
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { shellEmbedAppName } from '../../app-name.js'
import { AppLoadingIndicator } from '../../apps/AppLoadingIndicator.js'
import type { DocPickerResult } from '../../context/doc-picker-atom.js'
import { NAV_MAX } from '../../message-bus/handlers/document.js'
import { registerShellEmbed, releaseShellEmbed, useShellEmbed } from '../../shell-embed.js'

export interface DocumentPickerViewPaneProps {
	/** The file to pick a view of; `srcIdTag` is the node serving it */
	file: DocPickerResult
	/** Initial view the source opens at */
	nav?: string
	title: string
	/** Left footer button: "Back" to the step, or "Cancel" when opened on a preset file */
	backLabel: string
	onBack: () => void
	/** Embed the whole document instead of a view (always offered) */
	onWholeDocument: () => void
	/** The confirmed view; `undefined` = the source reported the whole document */
	onConfirm: (nav: string | undefined) => void
	onClose: () => void
}

export function DocumentPickerViewPane({
	file,
	nav,
	title,
	backLabel,
	onBack,
	onWholeDocument,
	onConfirm,
	onClose
}: DocumentPickerViewPaneProps) {
	const { t } = useTranslation()
	// The app *bundle* is a static asset of our own node, whatever node serves the document
	const { api: homeApi } = useApi()
	const [report, setReport] = React.useState<{ src?: string; p: EmbedViewReportPayload }>()
	const [attempt, setAttempt] = React.useState(0)
	const [box, setBox] = React.useState<{ w: number; h: number }>()
	const bodyRef = React.useRef<HTMLDivElement>(null)

	// `box` sizing needs the pane's real size; without it ViewEmbed falls back to 400px
	React.useEffect(() => {
		const el = bodyRef.current
		if (!el) return
		const ro = new ResizeObserver(([entry]) => {
			const { width, height } = entry.contentRect
			setBox({ w: Math.round(width), h: Math.round(height) })
		})
		ro.observe(el)
		return () => ro.disconnect()
	}, [])

	// No context = the home node (as in DocumentPickerBrowseTab)
	const srcIdTag = file.srcIdTag || homeApi?.idTag
	const embed = useShellEmbed(
		homeApi?.idTag && srcIdTag
			? {
					resId: `${srcIdTag}:${file.fileId}`,
					idTag: homeApi.idTag,
					contentType: file.contentType,
					navState: nav,
					// Invariant: pick-view never edits
					access: 'read',
					mode: 'pick-view',
					retryKey: attempt,
					register: registerShellEmbed,
					release: releaseShellEmbed
				}
			: null
	)

	const appId = shellEmbedAppName(file.contentType)
	// Only a report from the current boot counts
	const live =
		embed.stage !== 'error' && report && report.src === embed.iframeSrc ? report.p : undefined
	const label = live?.a11yLabel || live?.title || t('Select the part you want to embed')

	return (
		<Dialog
			open
			onClose={onClose}
			size="lg"
			icon={<IcDocument />}
			title={title}
			footer={
				<ActionBar>
					<Button onClick={onBack}>{backLabel}</Button>
					<Button onClick={onWholeDocument}>{t('Whole document')}</Button>
					<Text emphasis="muted" truncate className="flex-fill">
						{label}
					</Text>
					<Button
						color="primary"
						disabled={!live || !!live.missing || (live.nav?.length ?? 0) > NAV_MAX}
						onClick={() => live && onConfirm(live.nav)}
					>
						{t('Use this view')}
					</Button>
				</ActionBar>
			}
		>
			{/* `pos-relative`: the loading indicator is a full-box overlay */}
			<VBox
				ref={bodyRef}
				className="pos-relative"
				style={{ height: '60vh', minHeight: '16rem' }}
			>
				<AppLoadingIndicator
					stage={embed.stage}
					errorCode={embed.errorCode}
					errorMessage={embed.error}
					subtle={embed.stage === 'syncing'}
					onRetry={() => setAttempt((n) => n + 1)}
				/>
				{embed.iframeSrc && embed.stage !== 'error' && box && (
					<ViewEmbed
						// A fresh element per boot (see LiveDocCard / `useShellEmbed`)
						key={embed.iframeSrc}
						src={embed.iframeSrc}
						trusted={embed.trusted}
						status="live"
						title={file.fileName}
						appId={appId}
						nav={nav}
						settings={{ sizing: 'box' }}
						box={box}
						canInteract
						active
						// ViewEmbed is keyed by iframeSrc, so the closure's src is that boot's
						onReport={(p) => setReport({ src: embed.iframeSrc, p })}
						onAppReady={embed.onAppReady}
						onAppError={embed.onAppError}
					/>
				)}
			</VBox>
		</Dialog>
	)
}

// vim: ts=4
