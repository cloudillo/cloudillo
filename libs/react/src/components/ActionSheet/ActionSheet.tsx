// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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

// ActionSheetSubItem - expands/collapses sub-items inline on mobile
export interface ActionSheetSubItemProps
	extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
	icon?: React.ReactNode
	label: string
	/** Optional secondary label (e.g. current value) */
	detail?: string
	disabled?: boolean
	children?: React.ReactNode
}

export const ActionSheetSubItem = createComponent<HTMLDivElement, ActionSheetSubItemProps>(
	'ActionSheetSubItem',
	({ icon, label, detail, disabled, children, className, ...props }, ref) => {
		const [isOpen, setIsOpen] = React.useState(false)

		return (
			<div ref={ref} className={className} {...props}>
				<button
					type="button"
					className={mergeClasses('c-action-sheet-item', disabled && 'disabled')}
					disabled={disabled}
					onClick={() => setIsOpen(!isOpen)}
				>
					{icon && <span className="c-action-sheet-item-icon">{icon}</span>}
					<span className="c-action-sheet-item-label">
						{label}
						{detail && (
							<span
								style={{
									marginLeft: 'var(--space-1)',
									color: 'var(--col-txt-muted)',
									fontWeight: 'normal'
								}}
							>
								{detail}
							</span>
						)}
					</span>
					<span
						className="c-menu-item-chevron"
						style={{
							transition: 'transform 0.2s',
							transform: isOpen ? 'rotate(90deg)' : 'none'
						}}
					>
						&#x25B8;
					</span>
				</button>
				{isOpen && <div style={{ paddingLeft: 'var(--space-4)' }}>{children}</div>}
			</div>
		)
	}
)

// vim: ts=4
