// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The host for server-rendered content: an empty box that React never renders
 * children into. The owner fills it through the ref — `SitePage` adopts the server's
 * node or swaps in a fetched fragment — so first paint stays the server's paint.
 *
 * It is also the published page's only scroll container (`.c-site-content-host` in
 * `./site-bar.css`, read by `site/scroll.ts`). The article inside wears
 * `@cloudillo/react/site/prose.css`.
 */

import * as React from 'react'

import '@cloudillo/react/site/prose.css'

export type ContentHostProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>

export const ContentHost = React.forwardRef<HTMLDivElement, ContentHostProps>(function ContentHost(
	{ className, ...props },
	ref
) {
	return (
		<div
			{...props}
			ref={ref}
			className={className ? `c-site-content-host ${className}` : 'c-site-content-host'}
		/>
	)
})

// vim: ts=4
