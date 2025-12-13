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

/**
 * Merge multiple refs into a single callback ref
 * Useful when a component needs to use both a forwarded ref and an internal ref
 *
 * @param refs - Array of refs to merge (can be callback refs or RefObjects)
 * @returns A callback ref that updates all provided refs
 *
 * @example
 * const Component = forwardRef((props, ref) => {
 *   const internalRef = useRef<HTMLDivElement>(null)
 *   const mergedRef = useMergedRefs(ref, internalRef)
 *   return <div ref={mergedRef} />
 * })
 */
export function useMergedRefs<T>(...refs: Array<React.Ref<T> | undefined>): React.RefCallback<T> {
	return React.useCallback(
		(node: T | null) => {
			refs.forEach((ref) => {
				if (typeof ref === 'function') {
					ref(node)
				} else if (ref && typeof ref === 'object') {
					;(ref as React.MutableRefObject<T | null>).current = node
				}
			})
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		refs
	)
}

/**
 * Lock body scroll when enabled
 * Preserves the original overflow value and restores it on cleanup
 *
 * @param locked - Whether to lock body scroll
 *
 * @example
 * function Modal({ isOpen }) {
 *   useBodyScrollLock(isOpen)
 *   return isOpen ? <div className="modal">...</div> : null
 * }
 */
export function useBodyScrollLock(locked: boolean): void {
	React.useEffect(() => {
		if (!locked) return

		const originalOverflow = document.body.style.overflow
		document.body.style.overflow = 'hidden'

		return () => {
			document.body.style.overflow = originalOverflow
		}
	}, [locked])
}

/**
 * Handle Escape key press when enabled
 *
 * @param onEscape - Callback to invoke when Escape is pressed
 * @param enabled - Whether the handler is active (default: true)
 *
 * @example
 * function Dialog({ isOpen, onClose }) {
 *   useEscapeKey(onClose, isOpen)
 *   return isOpen ? <div className="dialog">...</div> : null
 * }
 */
export function useEscapeKey(onEscape: () => void, enabled = true): void {
	React.useEffect(() => {
		if (!enabled) return

		function handleKeyDown(evt: KeyboardEvent) {
			if (evt.key === 'Escape') {
				onEscape()
			}
		}

		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [onEscape, enabled])
}

/**
 * Handle clicks outside a referenced element
 *
 * @param ref - React ref to the element
 * @param onOutsideClick - Callback to invoke when clicking outside
 * @param enabled - Whether the handler is active (default: true)
 *
 * @example
 * function Dropdown({ isOpen, onClose }) {
 *   const ref = useRef<HTMLDivElement>(null)
 *   useOutsideClick(ref, onClose, isOpen)
 *   return <div ref={ref}>...</div>
 * }
 */
export function useOutsideClick<T extends HTMLElement>(
	ref: React.RefObject<T | null>,
	onOutsideClick: () => void,
	enabled = true
): void {
	React.useEffect(() => {
		if (!enabled) return

		function handleClick(evt: MouseEvent) {
			if (ref.current && !ref.current.contains(evt.target as Node)) {
				onOutsideClick()
			}
		}

		// Use mousedown to catch clicks before they bubble
		document.addEventListener('mousedown', handleClick)
		return () => document.removeEventListener('mousedown', handleClick)
	}, [ref, onOutsideClick, enabled])
}

// vim: ts=4
