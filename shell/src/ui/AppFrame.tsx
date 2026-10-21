// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { appSandbox } from '@cloudillo/core'
import { EmptyState, IcUntrusted, mergeClasses, VisuallyHidden } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import type { TrustLevel } from '../utils.js'
import './app-frame.css'

export interface AppFrameProps
	extends Omit<React.IframeHTMLAttributes<HTMLIFrameElement>, 'sandbox' | 'className'> {
	trust: TrustLevel
	/** The manifest's `requiresTrusted`: below `'trusted'` the frame shows a refusal card, not the app */
	requiresTrusted?: boolean
	/** On the frame box, not the iframe */
	className?: string
	/** Overlays above the iframe, e.g. the loading indicator */
	children?: React.ReactNode
}

/**
 * The sandboxed microfrontend iframe with its trust badge. The sandbox comes from
 * `appSandbox()` and is not overridable: only `trust === 'trusted'` (the trust level from
 * `appTrust()`, `shell/src/app-trust.ts`) gets `APP_SANDBOX_TRUSTED`, which adds
 * `allow-same-origin`; semi-trusted and untrusted apps keep the opaque-origin
 * `APP_SANDBOX`. A `requiresTrusted` app below `'trusted'` never boots — the frame
 * renders a refusal card instead of the iframe.
 */
export const AppFrame = React.forwardRef<HTMLIFrameElement, AppFrameProps>(function AppFrame(
	{ trust, requiresTrusted, className, children, ...iframeProps },
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

	if (requiresTrusted && trust !== 'trusted') {
		return (
			<EmptyState
				fill
				className={className}
				color="warning"
				icon={<IcUntrusted />}
				title={t('This app needs trusted mode')}
				description={t('It can only run when its trust level is set to trusted.')}
			/>
		)
	}

	return (
		<div className={mergeClasses('c-app-frame flex-fill pos-relative', trust, className)}>
			{children}
			{/* ds-allow: media */}
			<iframe
				{...iframeProps}
				ref={ref}
				sandbox={appSandbox(trust === 'trusted')}
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
