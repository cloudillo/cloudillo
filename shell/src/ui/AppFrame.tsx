// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { APP_SANDBOX } from '@cloudillo/core'
import { mergeClasses, VisuallyHidden } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import type { TrustLevel } from '../utils.js'
import './app-frame.css'

export interface AppFrameProps
	extends Omit<React.IframeHTMLAttributes<HTMLIFrameElement>, 'sandbox' | 'className'> {
	trust: TrustLevel
	/** On the frame box, not the iframe */
	className?: string
	/** Overlays above the iframe, e.g. the loading indicator */
	children?: React.ReactNode
}

/**
 * The sandboxed microfrontend iframe with its trust badge. The sandbox is always
 * `APP_SANDBOX` — never `allow-same-origin` — and is not overridable.
 */
export const AppFrame = React.forwardRef<HTMLIFrameElement, AppFrameProps>(function AppFrame(
	{ trust, className, children, ...iframeProps },
	ref
) {
	const { t } = useTranslation()
	// Shell sheets turn top-anchored while an app is shown (components.css `:root[data-app-frame]`)
	React.useEffect(() => {
		document.documentElement.dataset.appFrame = ''
		return () => {
			delete document.documentElement.dataset.appFrame
		}
	}, [])
	const badge =
		trust === 'semi-trusted'
			? t('Verified')
			: trust === 'untrusted'
				? t('Unverified')
				: undefined

	return (
		<div className={mergeClasses('c-app-frame flex-fill pos-relative', trust, className)}>
			{children}
			{/* ds-allow: media */}
			<iframe
				{...iframeProps}
				ref={ref}
				sandbox={APP_SANDBOX}
				className="c-app-frame-iframe"
			/>
			{badge && (
				<span className="c-app-frame-badge">
					<VisuallyHidden>{t('App trust:')} </VisuallyHidden>
					{trust === 'untrusted' ? '⚠ ' : '✓ '}
					{badge}
				</span>
			)}
		</div>
	)
})

// vim: ts=4
