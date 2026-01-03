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

/**
 * ViewPicker component - Navigation bar for views/slides
 */

import * as React from 'react'
import { mergeClasses } from '../utils'

import {
	PiPlusBold as IcAdd,
	PiCaretLeftBold as IcPrev,
	PiCaretRightBold as IcNext,
	PiPlayBold as IcPlay,
	PiStopBold as IcStop
} from 'react-icons/pi'

import type { ViewId, ViewNode } from '../crdt'
import type { PresenterInfo } from '../awareness'

export interface ViewPickerProps {
	views: ViewNode[]
	activeViewId: ViewId | null
	onViewSelect: (id: ViewId) => void
	onAddView: () => void
	onPrevView: () => void
	onNextView: () => void
	onPresent: () => void
	readOnly?: boolean
	/** Callback to reorder a view to a new index in presentation order */
	onReorderView?: (viewId: ViewId, newIndex: number) => void
	/** Whether the local user is currently presenting */
	isPresenting?: boolean
	/** Callback to stop presenting */
	onStopPresenting?: () => void
	/** Active presenters for showing badges */
	activePresenters?: PresenterInfo[]
}

// Drag state types
interface ViewDragData {
	viewId: ViewId
	originalIndex: number
}

interface ViewDropTarget {
	viewId: ViewId
	position: 'before' | 'after'
}

export function ViewPicker({
	views,
	activeViewId,
	onViewSelect,
	onAddView,
	onPrevView,
	onNextView,
	onPresent,
	readOnly,
	onReorderView,
	isPresenting,
	onStopPresenting,
	activePresenters = []
}: ViewPickerProps) {
	const activeIndex = views.findIndex((v) => v.id === activeViewId)

	// Get presenter badges for each slide
	const getPresenterBadges = (viewId: ViewId): PresenterInfo[] => {
		return activePresenters.filter((p) => p.viewId === viewId)
	}

	// Drag-and-drop state
	const [draggedView, setDraggedView] = React.useState<ViewDragData | null>(null)
	const [dropTarget, setDropTarget] = React.useState<ViewDropTarget | null>(null)

	// Check if drag-drop is enabled
	const isDragEnabled = !readOnly && !!onReorderView

	// Cleanup helper
	const clearDragState = React.useCallback(() => {
		setDraggedView(null)
		setDropTarget(null)
	}, [])

	// Drag start handler
	const handleDragStart = React.useCallback(
		(e: React.DragEvent, viewId: ViewId, index: number) => {
			if (!isDragEnabled) return

			e.dataTransfer.effectAllowed = 'move'
			e.dataTransfer.setData('text/plain', viewId)
			setDraggedView({ viewId, originalIndex: index })
		},
		[isDragEnabled]
	)

	// Drag over handler - calculate drop position
	const handleDragOver = React.useCallback(
		(e: React.DragEvent, targetViewId: ViewId) => {
			e.preventDefault()
			e.stopPropagation()

			// Don't allow dropping on self
			if (!draggedView || draggedView.viewId === targetViewId) {
				setDropTarget(null)
				return
			}

			// Calculate position based on mouse X within the target element
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
			const x = e.clientX - rect.left
			const position: 'before' | 'after' = x < rect.width * 0.5 ? 'before' : 'after'

			e.dataTransfer.dropEffect = 'move'
			setDropTarget({ viewId: targetViewId, position })
		},
		[draggedView]
	)

	// Drag leave handler
	const handleDragLeave = React.useCallback((e: React.DragEvent) => {
		// Only clear if leaving the tabs container entirely
		const relatedTarget = e.relatedTarget as Element | null
		if (!relatedTarget || !relatedTarget.closest?.('.c-view-picker-tabs')) {
			setDropTarget(null)
		}
	}, [])

	// Drop handler - execute reorder
	const handleDrop = React.useCallback(
		(e: React.DragEvent, targetViewId: ViewId, targetIndex: number) => {
			e.preventDefault()
			e.stopPropagation()

			if (!draggedView || !dropTarget || !onReorderView) {
				clearDragState()
				return
			}

			// Calculate new index based on drop position
			// Note: reorderView() handles the adjustment for removing the source item
			let newIndex = targetIndex
			if (dropTarget.position === 'after') {
				newIndex = targetIndex + 1
			}

			// Only reorder if position actually changed
			if (newIndex !== draggedView.originalIndex) {
				onReorderView(draggedView.viewId, newIndex)
			}

			clearDragState()
		},
		[draggedView, dropTarget, onReorderView, clearDragState]
	)

	// Drag end handler - cleanup
	const handleDragEnd = React.useCallback(() => {
		clearDragState()
	}, [clearDragState])

	return (
		<div className="c-nav c-hbox p-1 gap-1">
			<button
				onClick={onPrevView}
				className="c-button icon"
				disabled={activeIndex <= 0}
				title="Previous page"
			>
				<IcPrev />
			</button>

			<div className="c-hbox gap-1 flex-fill c-view-picker-tabs">
				{views.map((view, index) => {
					const presenters = getPresenterBadges(view.id)

					return (
						<button
							key={view.id}
							onClick={() => onViewSelect(view.id)}
							className={mergeClasses(
								'c-button c-view-picker-tab',
								view.id === activeViewId && 'active',
								draggedView?.viewId === view.id && 'dragging',
								dropTarget?.viewId === view.id &&
									dropTarget.position === 'before' &&
									'drop-before',
								dropTarget?.viewId === view.id &&
									dropTarget.position === 'after' &&
									'drop-after',
								presenters.length > 0 && 'has-presenter'
							)}
							draggable={isDragEnabled}
							onDragStart={(e) => handleDragStart(e, view.id, index)}
							onDragOver={(e) => handleDragOver(e, view.id)}
							onDragLeave={handleDragLeave}
							onDrop={(e) => handleDrop(e, view.id, index)}
							onDragEnd={handleDragEnd}
						>
							{index + 1}
							{presenters.length > 0 && (
								<span className="c-view-picker-tab__presenter-badge">
									{presenters.map((p, i) => (
										<span
											key={p.clientId}
											className="c-view-picker-tab__presenter-dot"
											style={{ backgroundColor: p.user.color }}
											title={p.user.name}
										/>
									))}
								</span>
							)}
						</button>
					)
				})}
			</div>

			<button
				onClick={onNextView}
				className="c-button icon"
				disabled={activeIndex >= views.length - 1}
				title="Next page"
			>
				<IcNext />
			</button>

			{!readOnly && (
				<button onClick={onAddView} className="c-button icon" title="Add page">
					<IcAdd />
				</button>
			)}

			{isPresenting ? (
				<button
					onClick={onStopPresenting}
					className="c-button icon ms-2 presenting"
					title="Stop presenting"
				>
					<IcStop />
				</button>
			) : (
				<button
					onClick={onPresent}
					className="c-button icon ms-2"
					title="Present (fullscreen)"
					disabled={views.length === 0}
				>
					<IcPlay />
				</button>
			)}
		</div>
	)
}

// vim: ts=4
