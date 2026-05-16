// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import ReactQRCode from 'react-qr-code'
import { LuCopy as IcCopy, LuCheck as IcCheck, LuShare2 as IcShare } from 'react-icons/lu'

import { Dialog } from '../Dialog/Dialog.js'
import { Button } from '../Button/Button.js'
import { resolveDefaultExport } from '../utils.js'
import { useLibTranslation } from '../../i18n.js'

const QRCode = resolveDefaultExport(ReactQRCode)

const COPIED_RESET_MS = 1500

export interface QRCodeDialogProps {
	/** The URL or text to encode as QR code. When undefined, the dialog is closed. */
	value: string | undefined
	/** Callback when the dialog is closed */
	onClose: () => void
	/** Optional dialog title. Defaults to a translated "Share via QR code". */
	title?: string
	/** Optional helper copy under the title. Defaults to a translated short instruction. */
	description?: string
}

/**
 * Dialog that displays a shareable link as a QR code with copy / share affordances.
 *
 * The dialog opens when `value` is a non-empty string and closes when undefined.
 * Consumers may override the title and description for context-specific copy.
 */
export function QRCodeDialog({ value, onClose, title, description }: QRCodeDialogProps) {
	const { t } = useLibTranslation()
	const urlInputRef = React.useRef<HTMLInputElement>(null)
	const [copied, setCopied] = React.useState(false)
	const copyTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

	React.useEffect(() => {
		setCopied(false)
		return () => {
			if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
		}
	}, [value])

	if (!value) return null
	const shareValue: string = value

	const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(shareValue)
			setCopied(true)
			if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
			copyTimerRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS)
		} catch {
			// Fallback: select the input so the user can Ctrl-C manually.
			urlInputRef.current?.select()
		}
	}

	async function handleShare() {
		try {
			await navigator.share({ url: shareValue, title: title ?? t('Shared link') })
		} catch {
			// User cancelled or share unavailable — silently ignore.
		}
	}

	function handleUrlFocus() {
		urlInputRef.current?.select()
	}

	const dialogTitle = title ?? t('Share via QR code')
	const dialogDescription = description ?? t('Scan with a phone camera, or copy the link below.')

	return (
		<Dialog open title={dialogTitle} onClose={onClose}>
			<div className="c-vbox g-3">
				<p className="m-0 text-muted">{dialogDescription}</p>

				<div
					className="mx-auto p-3"
					style={{
						background: '#fff',
						borderRadius: 8,
						width: '100%',
						maxWidth: 'min(100%,40vh)'
					}}
					aria-hidden="true"
				>
					<QRCode value={shareValue} style={{ width: '100%', height: 'auto' }} />
				</div>

				<div className="c-hbox g-2 align-items-center">
					<input
						ref={urlInputRef}
						className="c-input fill"
						type="text"
						value={shareValue}
						readOnly
						onFocus={handleUrlFocus}
						aria-label={t('Shareable link')}
					/>
					<Button
						variant={copied ? 'success' : 'primary'}
						onClick={handleCopy}
						icon={copied ? <IcCheck /> : <IcCopy />}
					>
						{copied ? t('Copied') : t('Copy')}
					</Button>
					<span role="status" aria-live="polite" className="c-sr-only">
						{copied ? t('Link copied to clipboard') : ''}
					</span>
				</div>

				{canShare && (
					<div className="c-hbox g-2">
						<Button kind="link" onClick={handleShare} icon={<IcShare />}>
							{t('Share…')}
						</Button>
					</div>
				)}
			</div>
		</Dialog>
	)
}

// vim: ts=4
