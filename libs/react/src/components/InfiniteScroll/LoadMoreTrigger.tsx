// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'
import { LoadingSpinner } from '../Loading/index.js'
import { Button } from '../Button/index.js'

export interface LoadMoreTriggerProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Whether more items are being loaded */
	isLoading?: boolean
	/** Whether there are more items to load */
	hasMore?: boolean
	/** Error from last fetch attempt */
	error?: Error | null
	/** Function to retry loading */
	onRetry?: () => void
	/** Loading label for screen readers */
	loadingLabel?: string
	/** Retry button label */
	retryLabel?: string
	/** Error message prefix */
	errorPrefix?: string
}

/**
 * Invisible sentinel element for infinite scroll with loading/error states.
 *
 * Place this component at the end of your scrollable list. The parent component
 * should attach the sentinelRef from useInfiniteScroll to this element.
 *
 * @example
 * ```tsx
 * const { items, isLoadingMore, hasMore, error, loadMore, sentinelRef } = useInfiniteScroll(...)
 *
 * return (
 *   <div>
 *     {items.map(item => <Item key={item.id} item={item} />)}
 *     <LoadMoreTrigger
 *       ref={sentinelRef}
 *       isLoading={isLoadingMore}
 *       hasMore={hasMore}
 *       error={error}
 *       onRetry={loadMore}
 *     />
 *   </div>
 * )
 * ```
 */
export const LoadMoreTrigger = createComponent<HTMLDivElement, LoadMoreTriggerProps>(
	'LoadMoreTrigger',
	(
		{
			className,
			isLoading = false,
			hasMore = true,
			error = null,
			onRetry,
			loadingLabel = 'Loading more items',
			retryLabel = 'Retry',
			errorPrefix = 'Failed to load:',
			...props
		},
		ref
	) => {
		// Don't render if no more items and not loading
		if (!hasMore && !isLoading && !error) {
			return <div ref={ref} className="c-load-more-trigger-sentinel" aria-hidden="true" />
		}

		return (
			<div ref={ref} className={mergeClasses('c-load-more-trigger', className)} {...props}>
				{/* Status announcements for screen readers */}
				<div aria-live="polite" aria-atomic="true" className="c-sr-only">
					{isLoading && loadingLabel}
					{error && `${errorPrefix} ${error.message}`}
				</div>

				{/* Loading state */}
				{isLoading && (
					<div className="c-load-more-trigger-loading">
						<LoadingSpinner size="sm" label={loadingLabel} />
					</div>
				)}

				{/* Error state with retry */}
				{error && !isLoading && (
					<div className="c-load-more-trigger-error">
						<span className="c-load-more-trigger-error-message">
							{errorPrefix} {error.message}
						</span>
						{onRetry && (
							<Button
								size="small"
								variant="secondary"
								onClick={onRetry}
								className="c-load-more-trigger-retry"
							>
								{retryLabel}
							</Button>
						)}
					</div>
				)}
			</div>
		)
	}
)

// vim: ts=4
