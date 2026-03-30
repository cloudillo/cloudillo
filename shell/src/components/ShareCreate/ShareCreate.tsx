// This file is part of the Cloudillo Platform.
// Copyright (C) 2024-2026  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * ShareCreate Component
 *
 * Confirmation dialog for share link creation requested by apps via message bus.
 * Creates a ref via API, builds a short URL, copies to clipboard, and returns result.
 *
 * When `reuse` is enabled, lists existing compatible refs and lets the user
 * pick one to generate a URL with appended params (no new ref created).
 */

import React from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog, Button, Badge, useToast, useApi } from '@cloudillo/react'
import type { Ref } from '@cloudillo/core'
import {
	setShareCreateCallback,
	type ShareCreateOpenOptions,
	type ShareCreateResultData
} from '../../message-bus/handlers/share.js'

interface PendingRequest {
	options: ShareCreateOpenOptions
	onResult: (result: ShareCreateResultData | null) => void
}

/**
 * Check if a ref is compatible for reuse (no nav= in its params)
 */
function isCompatibleRef(ref: Ref): boolean {
	if (!ref.params) return true
	const params = new URLSearchParams(ref.params)
	return !params.has('nav')
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
	const { api } = useApi()
	const toast = useToast()
	const [pending, setPending] = React.useState<PendingRequest | null>(null)
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

				const compatible = (Array.isArray(refs) ? refs : []).filter(isCompatibleRef)
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
			const baseUrl = `${window.location.origin}/s/${selectedRefId}`
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
				expiresAt: pending.options.expiresAt,
				count: pending.options.count ?? null,
				params: pending.options.params
			})

			const url = `${window.location.origin}/s/${ref.refId}`

			try {
				await navigator.clipboard.writeText(url)
				toast.success(t('Link copied to clipboard'))
			} catch {
				toast.info(t('Share link created'))
			}

			pending.onResult({ refId: ref.refId, url })
		} catch (err) {
			console.error('[ShareCreate] Failed to create share link:', err)
			toast.error(t('Failed to create share link'))
			pending.onResult(null)
		} finally {
			setCreating(false)
			setPending(null)
		}
	}, [pending, api, mode, selectedRefId, t, toast])

	if (!pending) return null

	const accessLabel = pending.options.accessLevel === 'write' ? t('Can edit') : t('View only')
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
					<div className="c-text-secondary" style={{ fontSize: '0.85em' }}>
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
									<span
										className="c-text-secondary"
										style={{ fontSize: '0.85em' }}
									>
										{expiry}
									</span>
								)}
								<Badge
									variant={ref.accessLevel === 'write' ? 'accent' : 'secondary'}
								>
									{ref.accessLevel === 'write' ? t('Can edit') : t('View only')}
								</Badge>
							</label>
						)
					})}
				</div>
			) : (
				<p className="c-text-secondary mt-2">
					{t('Access')}: {accessLabel}
				</p>
			)}

			<div className="c-hbox justify-content-end g-2 mt-3">
				<Button onClick={handleCancel}>{t('Cancel')}</Button>
				<Button
					variant="primary"
					onClick={handleConfirm}
					disabled={creating || loadingRefs}
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
