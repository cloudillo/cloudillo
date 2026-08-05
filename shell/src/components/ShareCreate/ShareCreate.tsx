// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * ShareCreate Component
 *
 * Confirmation dialog for share link creation requested by apps via message bus.
 * Creates a ref via API, builds a short URL, copies to clipboard, and returns result.
 *
 * When `reuse` is enabled, lists existing compatible refs and lets the user
 * pick one to generate a URL with appended params (no new ref created).
 */

import type { Ref } from '@cloudillo/core'
import { Badge, Button, Dialog, useAuth, useToast } from '@cloudillo/react'
import dayjs from 'dayjs'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { useApiContext } from '../../context/index.js'
import {
	type ShareCreateOpenOptions,
	type ShareCreateResultData,
	setShareCreateCallback
} from '../../message-bus/handlers/share.js'
import { useShareOrigin } from '../../utils/appOrigin.js'
import { isRefReusable, shareLinkErrorMessage } from '../../utils/refs.js'

interface PendingRequest {
	options: ShareCreateOpenOptions
	onResult: (result: ShareCreateResultData | null) => void
}

/**
 * Format ref expiration for display (e.g., "expires 2026-04-15")
 */
function formatExpiry(ref: Ref, t: (key: string) => string): string | null {
	if (!ref.expiresAt) return null
	const date = new Date(ref.expiresAt)
	return `${t('expires')} ${date.toLocaleDateString()}`
}

export function ShareCreate() {
	const { t } = useTranslation()
	const { getClientFor } = useApiContext()
	const [auth] = useAuth()
	const toast = useToast()
	const [pending, setPending] = React.useState<PendingRequest | null>(null)
	const ownerIdTag = pending?.options.ownerIdTag
	// Client targeting the document owner's tenant (where the ref must live).
	const api = React.useMemo(
		// Explicit: the user opened this dialog to create a share on that tenant.
		() => (ownerIdTag ? getClientFor(ownerIdTag, { auth: 'required', explicit: true }) : null),
		[ownerIdTag, getClientFor]
	)
	// `api` is built FROM ownerIdTag right above, so the client and the cache key name one tenant
	const shareOrigin = useShareOrigin(api, ownerIdTag, auth?.idTag)
	const [creating, setCreating] = React.useState(false)
	const [compatibleRefs, setCompatibleRefs] = React.useState<Ref[]>([])
	const [loadingRefs, setLoadingRefs] = React.useState(false)
	const [mode, setMode] = React.useState<'reuse' | 'create'>('create')
	const [selectedRefId, setSelectedRefId] = React.useState<string | undefined>()

	// Register callback for message bus handler
	React.useEffect(() => {
		setShareCreateCallback((options, onResult) => {
			setPending({ options, onResult })
			setCompatibleRefs([])
			setLoadingRefs(false)
			setMode('create')
			setSelectedRefId(undefined)
		})

		return () => {
			setShareCreateCallback(null)
		}
	}, [])

	// Fetch existing refs when reuse is requested
	React.useEffect(() => {
		if (!pending?.options.reuse || !api) return

		let cancelled = false
		setLoadingRefs(true)

		;(async () => {
			try {
				const refs = await api.refs.list({
					type: 'share.file',
					resourceId: pending.options.resourceId
				})
				if (cancelled) return

				// `isRefReusable` also drops REDACTED refs: for a share reader the server replaces
				// refId with an opaque r1~… digest, and reusing one copies a permanently dead URL
				// to the clipboard and returns it to the app as a success. When every returned ref
				// is redacted this list is simply empty, the dialog stays in 'create' mode, and the
				// 403 that follows now carries the real reason.
				const compatible = (Array.isArray(refs) ? refs : []).filter(isRefReusable)
				setCompatibleRefs(compatible)

				if (compatible.length > 0) {
					setSelectedRefId(compatible[0].refId)
					setMode('reuse')
				}
			} catch (err) {
				console.error('[ShareCreate] Failed to list refs:', err)
			} finally {
				if (!cancelled) setLoadingRefs(false)
			}
		})()

		return () => {
			cancelled = true
		}
	}, [pending, api])

	const handleCancel = React.useCallback(() => {
		pending?.onResult(null)
		setPending(null)
	}, [pending])

	const handleConfirm = React.useCallback(async () => {
		if (!pending || !api) return

		if (mode === 'reuse' && selectedRefId) {
			// Reuse existing ref — construct URL with appended params
			const baseUrl = `${shareOrigin.href}/s/${selectedRefId}`
			const url = pending.options.params ? `${baseUrl}?${pending.options.params}` : baseUrl

			try {
				await navigator.clipboard.writeText(url)
				toast.success(t('Link copied to clipboard'))
			} catch {
				toast.info(t('Share link created'))
			}

			pending.onResult({ refId: selectedRefId, url })
			setPending(null)
			return
		}

		// Create new ref
		setCreating(true)
		try {
			const ref = await api.refs.create({
				type: 'share.file',
				resourceId: pending.options.resourceId,
				accessLevel: pending.options.accessLevel || 'read',
				description: pending.options.description,
				expiresAt:
					pending.options.expiresAt != null
						? dayjs(pending.options.expiresAt).endOf('day').toISOString()
						: undefined,
				count: pending.options.count ?? null,
				params: pending.options.params
			})

			const url = `${shareOrigin.href}/s/${ref.refId}`

			try {
				await navigator.clipboard.writeText(url)
				toast.success(t('Link copied to clipboard'))
			} catch {
				toast.info(t('Share link created'))
			}

			pending.onResult({ refId: ref.refId, url })
		} catch (err) {
			console.error('[ShareCreate] Failed to create share link:', err)
			toast.error(shareLinkErrorMessage(err, t))
			pending.onResult(null)
		} finally {
			setCreating(false)
			setPending(null)
		}
	}, [pending, api, mode, selectedRefId, shareOrigin, t, toast])

	if (!pending) return null

	const accessLabel =
		pending.options.accessLevel === 'write'
			? t('Can edit')
			: pending.options.accessLevel === 'comment'
				? t('Can comment')
				: t('View only')
	const showReuse = pending.options.reuse && compatibleRefs.length > 0

	return (
		<Dialog open title={t('Create share link')} onClose={handleCancel}>
			<p>{pending.options.description || t('Share this document')}</p>

			{showReuse ? (
				<div className="c-vbox g-2 mt-3">
					<label className="c-hbox g-2 align-items-center">
						<input
							type="radio"
							name="share-choice"
							checked={mode === 'create'}
							onChange={() => setMode('create')}
						/>
						<span className="flex-fill">{t('Create new link')}</span>
						<Badge
							variant={
								pending.options.accessLevel === 'write' ? 'accent' : 'secondary'
							}
						>
							{accessLabel}
						</Badge>
					</label>
					<hr style={{ margin: 0, opacity: 0.2 }} />
					<div className="text-secondary" style={{ fontSize: '0.85em' }}>
						{t('Use existing link')}
					</div>
					{compatibleRefs.map((ref) => {
						const expiry = formatExpiry(ref, t)
						return (
							<label key={ref.refId} className="c-hbox g-2 align-items-center">
								<input
									type="radio"
									name="share-choice"
									checked={mode === 'reuse' && selectedRefId === ref.refId}
									onChange={() => {
										setMode('reuse')
										setSelectedRefId(ref.refId)
									}}
								/>
								<span className="flex-fill">
									{ref.description || t('Shared link')}
								</span>
								{expiry && (
									<span className="text-secondary" style={{ fontSize: '0.85em' }}>
										{expiry}
									</span>
								)}
								<Badge
									variant={ref.accessLevel === 'write' ? 'accent' : 'secondary'}
								>
									{ref.accessLevel === 'write'
										? t('Can edit')
										: ref.accessLevel === 'comment'
											? t('Can comment')
											: t('View only')}
								</Badge>
							</label>
						)
					})}
				</div>
			) : (
				<p className="text-secondary mt-2">
					{t('Access')}: {accessLabel}
				</p>
			)}

			{shareOrigin.status === 'failed' && (
				<p className="text-danger mt-2" role="alert">
					{t('Could not determine the share address for this document.')}
				</p>
			)}

			<div className="c-hbox justify-content-end g-2 mt-3">
				<Button onClick={handleCancel}>{t('Cancel')}</Button>
				{/* Both paths hand out a URL, and /s/:refId resolves the ref against the ORIGIN's
				    tenant - built on our own host, a foreign owner's link 404s for whoever receives
				    it. So the confirm waits for the owner's real app domain, and stays disabled for
				    good if it never arrives. */}
				<Button
					variant="primary"
					onClick={handleConfirm}
					disabled={creating || loadingRefs || !shareOrigin.trusted}
				>
					{creating
						? t('Creating...')
						: mode === 'reuse'
							? t('Copy page link')
							: t('Create & copy link')}
				</Button>
			</div>
		</Dialog>
	)
}

// vim: ts=4
