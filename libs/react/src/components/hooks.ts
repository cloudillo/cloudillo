// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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

/**
 * Responsive breakpoint scale, matching OpalUI's bands (`local/opalui/src/layout.css`).
 *
 * Kept in `rem`, not px: OpalUI 0.15.0 made every band font-relative, so a px
 * constant here would silently disagree with the stylesheets at any root font
 * size other than 16px.
 *
 * - `md` (48rem): filter column appears; below this the layout is single-column.
 * - `lg` (72rem): top nav takes over, the context sidebar pins open.
 * - `xl` (96rem): the FCD details rail can dock beside the container.
 */
export const BREAKPOINTS = {
	md: '48rem',
	lg: '72rem',
	xl: '96rem'
} as const

export type Breakpoint = keyof typeof BREAKPOINTS

/**
 * Hook to detect if viewport matches a media query
 *
 * @param query - Media query string (e.g., '(max-width: 768px)')
 * @returns Whether the media query matches
 *
 * @example
 * const isMobile = useMediaQuery('(max-width: 767px)')
 * const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')
 */
export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = React.useState(() => {
		if (typeof window === 'undefined') return false
		return window.matchMedia(query).matches
	})

	React.useEffect(() => {
		const mediaQuery = window.matchMedia(query)

		const handleChange = (e: MediaQueryListEvent) => {
			setMatches(e.matches)
		}

		// Set initial value
		setMatches(mediaQuery.matches)

		// Listen for changes
		mediaQuery.addEventListener('change', handleChange)
		return () => mediaQuery.removeEventListener('change', handleChange)
	}, [query])

	return matches
}

function breakpointLength(breakpoint: Breakpoint | number): string {
	return typeof breakpoint === 'number' ? `${breakpoint}px` : BREAKPOINTS[breakpoint]
}

/**
 * Hook to detect if viewport is narrower than a breakpoint
 *
 * @param breakpoint - A {@link BREAKPOINTS} key, or a raw px width (default: `'md'`)
 * @returns Whether viewport width is below the breakpoint
 *
 * @example
 * const isMobile = useIsMobile()
 * const isBelowDesktop = useIsMobile('lg')
 * const isSmall = useIsMobile(480)
 */
export function useIsMobile(breakpoint: Breakpoint | number = 'md'): boolean {
	return useMediaQuery(`(width < ${breakpointLength(breakpoint)})`)
}

/**
 * Hook to detect if viewport is at least as wide as a breakpoint
 *
 * @param breakpoint - A {@link BREAKPOINTS} key, or a raw px width (default: `'lg'`)
 * @returns Whether viewport width is at or above the breakpoint
 *
 * @example
 * const isDesktop = useIsDesktop()
 * const canDockDetails = useIsDesktop('xl')
 */
export function useIsDesktop(breakpoint: Breakpoint | number = 'lg'): boolean {
	return useMediaQuery(`(width >= ${breakpointLength(breakpoint)})`)
}

/**
 * Hook to detect if user prefers reduced motion
 *
 * @returns Whether user prefers reduced motion
 *
 * @example
 * const prefersReducedMotion = usePrefersReducedMotion()
 * const duration = prefersReducedMotion ? 0 : 300
 */
export function usePrefersReducedMotion(): boolean {
	return useMediaQuery('(prefers-reduced-motion: reduce)')
}

/**
 * Debounce a value by delaying updates until a specified period of inactivity
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds before the value updates
 * @returns The debounced value
 *
 * @example
 * const debouncedSearch = useDebouncedValue(searchInput, 300)
 * // debouncedSearch only updates 300ms after the last searchInput change
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
	const [debouncedValue, setDebouncedValue] = React.useState(value)

	React.useEffect(
		function debounceValue() {
			const timer = setTimeout(() => setDebouncedValue(value), delay)
			return () => clearTimeout(timer)
		},
		[value, delay]
	)

	return debouncedValue
}

// vim: ts=4
