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
