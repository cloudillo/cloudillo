// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import {
	Affix,
	Badge,
	Button,
	Disclosure,
	HBox,
	Icon,
	List,
	ListItem,
	LoadingSpinner,
	Panel,
	Progress,
	Text
} from '@cloudillo/react'
import { useTranslation } from 'react-i18next'
import {
	LuCheck as IcCheck,
	LuX as IcClose,
	LuCircleAlert as IcError,
	LuFile as IcFile,
	LuLink2 as IcLink
} from 'react-icons/lu'

import type { UploadItem } from '../hooks/useUploadQueue.js'

export interface UploadProgressProps {
	queue: UploadItem[]
	stats: {
		total: number
		completed: number
		errors: number
		pending: number
	}
	onRemoveItem?: (id: string) => void
	onClearCompleted?: () => void
	onClearAll?: () => void
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function UploadItemRow({ item, onRemove }: { item: UploadItem; onRemove?: (id: string) => void }) {
	const { t } = useTranslation()
	return (
		<ListItem
			leading={
				item.status === 'complete' ? (
					<Icon as={IcCheck} color="success" />
				) : item.status === 'error' ? (
					<Icon as={IcError} color="error" />
				) : item.status === 'uploading' ? (
					<LoadingSpinner size="xs" />
				) : (
					<Icon as={IcFile} />
				)
			}
			title={item.file.name}
			subtitle={
				<HBox gap={1} align="center" wrap>
					{formatFileSize(item.file.size)}
					{item.status === 'complete' && item.existed && (
						<Badge
							color="info"
							size="sm"
							icon={<IcLink />}
							aria-label={t('Already on server — reused existing file')}
						>
							{t('reused')}
						</Badge>
					)}
					{item.error && <Text color="error">{item.error}</Text>}
				</HBox>
			}
			actions={
				(item.status === 'complete' || item.status === 'error') &&
				onRemove && (
					<Button
						variant="ghost"
						size="xs"
						icon={<IcClose />}
						onClick={() => onRemove(item.id)}
						aria-label={t('Remove')}
					/>
				)
			}
		/>
	)
}

export function UploadProgress({
	queue,
	stats,
	onRemoveItem,
	onClearCompleted,
	onClearAll
}: UploadProgressProps) {
	const { t } = useTranslation()

	if (queue.length === 0) return null

	const progressPercent = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
	const hasErrors = stats.errors > 0
	const isComplete = stats.pending === 0

	return (
		<Affix position="bottom-end" offset={3}>
			<Panel
				elevation="high"
				title={
					<HBox gap={2} align="center" role="status">
						{!isComplete ? (
							<>
								<LoadingSpinner size="xs" />
								{t('Uploading {{completed}} of {{total}}', {
									completed: stats.completed,
									total: stats.total
								})}
							</>
						) : hasErrors ? (
							<>
								<Icon as={IcError} color="error" />
								{t('{{completed}} uploaded, {{errors}} failed', {
									completed: stats.completed,
									errors: stats.errors
								})}
							</>
						) : (
							<>
								<Icon as={IcCheck} color="success" />
								{t('{{completed}} files uploaded', { completed: stats.completed })}
							</>
						)}
					</HBox>
				}
				actions={
					isComplete && (
						<>
							{stats.completed > 0 && onClearCompleted && (
								<Button variant="ghost" size="sm" onClick={onClearCompleted}>
									{t('Clear completed')}
								</Button>
							)}
							{onClearAll && (
								<Button variant="ghost" size="sm" onClick={onClearAll}>
									{t('Clear all')}
								</Button>
							)}
						</>
					)
				}
			>
				{!isComplete && <Progress value={progressPercent} />}
				<Disclosure summary={t('Files')} defaultOpen>
					<List>
						{queue.map((item) => (
							<UploadItemRow key={item.id} item={item} onRemove={onRemoveItem} />
						))}
					</List>
				</Disclosure>
			</Panel>
		</Affix>
	)
}

// vim: ts=4
