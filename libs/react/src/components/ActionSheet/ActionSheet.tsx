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
import { createPortal } from 'react-dom'
import { mergeClasses, createComponent } from '../utils.js'
import { useMergedRefs, useBodyScrollLock, useEscapeKey } from '../hooks.js'

export interface ActionSheetProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
	isOpen: boolean
	onClose: () => void
	title?: string
	children?: React.ReactNode
}

export const ActionSheet = createComponent<HTMLDivElement, ActionSheetProps>(
	'ActionSheet',
	({ isOpen, onClose, title, children, className, ...props }, ref) => {
		const sheetRef = React.useRef<HTMLDivElement | null>(null)
		const [isVisible, setIsVisible] = React.useState(false)
		const [isAnimating, setIsAnimating] = React.useState(false)

		// Combine refs using shared hook
		const mergedRef = useMergedRefs(ref, sheetRef)

		// Handle open/close animation
		React.useEffect(
			function handleOpenClose() {
				if (isOpen) {
					setIsVisible(true)
					// Trigger animation on next frame
					requestAnimationFrame(() => {
						requestAnimationFrame(() => {
							setIsAnimating(true)
						})
					})
				} else {
					setIsAnimating(false)
					// Wait for animation to complete before hiding
					const timer = setTimeout(() => {
						setIsVisible(false)
					}, 300)
					return () => clearTimeout(timer)
				}
			},
			[isOpen]
		)

		// Lock body scroll when open
		useBodyScrollLock(isOpen)

		// Close on Escape
		useEscapeKey(onClose, isOpen)

		// Focus management - move focus to sheet and restore on close
		React.useEffect(
			function manageFocus() {
				if (!isOpen) return

				const previouslyFocused = document.activeElement as HTMLElement

				// Focus the first focusable item in the sheet
				const timer = setTimeout(() => {
					if (!sheetRef.current) return
					const firstItem = sheetRef.current.querySelector<HTMLButtonElement>(
						'.c-action-sheet-item:not([disabled])'
					)
					if (firstItem) {
						firstItem.focus()
					} else {
						// Fallback: make sheet focusable
						sheetRef.current.focus()
					}
				}, 50) // Small delay to allow animation to start

				return () => {
					clearTimeout(timer)
					// Restore focus when closing
					previouslyFocused?.focus()
				}
			},
			[isOpen]
		)

		// Handle backdrop click
		function handleBackdropClick(evt: React.MouseEvent) {
			if (evt.target === evt.currentTarget) {
				onClose()
			}
		}

		if (!isVisible) return null

		const sheetElement = (
			<div
				className={mergeClasses('c-action-sheet-backdrop', isAnimating && 'show')}
				onClick={handleBackdropClick}
			>
				<div
					ref={mergedRef}
					className={mergeClasses('c-action-sheet', isAnimating && 'show', className)}
					role="dialog"
					aria-modal="true"
					aria-label={title}
					tabIndex={-1}
					{...props}
				>
					{title && (
						<div className="c-action-sheet-header">
							<span className="c-action-sheet-title">{title}</span>
						</div>
					)}
					<div className="c-action-sheet-content">{children}</div>
				</div>
			</div>
		)

		// Render in portal to escape stacking context issues
		const portalContainer = document.getElementById('popper-container') || document.body
		return createPortal(sheetElement, portalContainer)
	}
)

export interface ActionSheetItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	icon?: React.ReactNode
	label: string
	danger?: boolean
}

export const ActionSheetItem = createComponent<HTMLButtonElement, ActionSheetItemProps>(
	'ActionSheetItem',
	({ icon, label, danger, disabled, onClick, className, ...props }, ref) => (
		<button
			ref={ref}
			type="button"
			className={mergeClasses('c-action-sheet-item', danger && 'danger', className)}
			disabled={disabled}
			onClick={onClick}
			{...props}
		>
			{icon && <span className="c-action-sheet-item-icon">{icon}</span>}
			<span className="c-action-sheet-item-label">{label}</span>
		</button>
	)
)

export interface ActionSheetDividerProps extends React.HTMLAttributes<HTMLDivElement> {}

export const ActionSheetDivider = createComponent<HTMLDivElement, ActionSheetDividerProps>(
	'ActionSheetDivider',
	({ className, ...props }, ref) => (
		<div ref={ref} className={mergeClasses('c-action-sheet-divider', className)} {...props} />
	)
)

// vim: ts=4
