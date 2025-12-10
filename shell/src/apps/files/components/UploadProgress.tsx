// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
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

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuCheck as IcCheck,
	LuX as IcClose,
	LuChevronDown as IcCollapse,
	LuChevronUp as IcExpand,
	LuCircleAlert as IcError,
	LuFile as IcFile
} from 'react-icons/lu'
import { mergeClasses } from '@cloudillo/react'

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
	return (
		<div className={mergeClasses('c-upload-item', item.status)}>
			<div className="c-upload-item-icon">
				{item.status === 'complete' && <IcCheck />}
				{item.status === 'error' && <IcError />}
				{item.status === 'uploading' && <span className="c-spinner xs" />}
				{item.status === 'queued' && <IcFile />}
			</div>
			<div className="c-upload-item-content">
				<div className="c-upload-item-name">{item.file.name}</div>
				<div className="c-upload-item-meta">
					{formatFileSize(item.file.size)}
					{item.error && <span className="c-upload-item-error">{item.error}</span>}
				</div>
			</div>
			{(item.status === 'complete' || item.status === 'error') && onRemove && (
				<button
					type="button"
					className="c-button link icon compact c-upload-item-remove"
					onClick={() => onRemove(item.id)}
					aria-label="Remove"
				>
					<IcClose />
				</button>
			)}
		</div>
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
	const [isCollapsed, setIsCollapsed] = React.useState(false)

	// Auto-collapse after all uploads complete
	React.useEffect(
		function autoCollapseOnComplete() {
			if (stats.pending === 0 && stats.total > 0) {
				const timer = setTimeout(() => setIsCollapsed(true), 3000)
				return () => clearTimeout(timer)
			}
		},
		[stats.pending, stats.total]
	)

	if (queue.length === 0) return null

	const progressPercent = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
	const hasErrors = stats.errors > 0
	const isComplete = stats.pending === 0

	return (
		<div className={mergeClasses('c-upload-panel', isCollapsed && 'collapsed')}>
			<div
				className="c-upload-panel-header"
				onClick={() => setIsCollapsed((c) => !c)}
				role="button"
				tabIndex={0}
				onKeyDown={(e) => e.key === 'Enter' && setIsCollapsed((c) => !c)}
			>
				<div className="c-upload-panel-title">
					{!isComplete ? (
						<>
							<span className="c-spinner xs" />
							{t('Uploading {{completed}} of {{total}}', {
								completed: stats.completed,
								total: stats.total
							})}
						</>
					) : hasErrors ? (
						<>
							<IcError className="c-upload-panel-icon error" />
							{t('{{completed}} uploaded, {{errors}} failed', {
								completed: stats.completed,
								errors: stats.errors
							})}
						</>
					) : (
						<>
							<IcCheck className="c-upload-panel-icon success" />
							{t('{{completed}} files uploaded', { completed: stats.completed })}
						</>
					)}
				</div>
				<button type="button" className="c-button link icon compact">
					{isCollapsed ? <IcExpand /> : <IcCollapse />}
				</button>
			</div>

			{!isComplete && (
				<div className="c-progress xs">
					<div className="bar" style={{ width: `${progressPercent}%` }} />
				</div>
			)}

			{!isCollapsed && (
				<>
					<div className="c-upload-panel-list">
						{queue.map((item) => (
							<UploadItemRow key={item.id} item={item} onRemove={onRemoveItem} />
						))}
					</div>

					{isComplete && (
						<div className="c-upload-panel-actions">
							{stats.completed > 0 && onClearCompleted && (
								<button
									type="button"
									className="c-button link small"
									onClick={onClearCompleted}
								>
									{t('Clear completed')}
								</button>
							)}
							{onClearAll && (
								<button
									type="button"
									className="c-button link small"
									onClick={onClearAll}
								>
									{t('Clear all')}
								</button>
							)}
						</div>
					)}
				</>
			)}
		</div>
	)
}

// vim: ts=4
