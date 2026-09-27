// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { ActionBar, Button, Dialog, Disclosure, Text } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuArrowLeft as IcBack,
	LuCircleAlert as IcError,
	LuRefreshCw as IcReload
} from 'react-icons/lu'

interface ErrorBoundaryState {
	hasError: boolean
	error: Error | null
}

interface ErrorBoundaryProps {
	children: React.ReactNode
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
	constructor(props: ErrorBoundaryProps) {
		super(props)
		this.state = { hasError: false, error: null }
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error }
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		console.error('[ErrorBoundary] Uncaught render error:', error, errorInfo)
	}

	render() {
		if (this.state.hasError) {
			return (
				<ErrorFallback
					error={this.state.error}
					onReset={() => this.setState({ hasError: false, error: null })}
				/>
			)
		}
		return this.props.children
	}
}

function ErrorFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
	const { t } = useTranslation()

	return (
		<Dialog
			open
			size="sm"
			dismissable={false}
			icon={<IcError size={32} className="text-error" />}
			title={t('Something went wrong')}
			footer={
				<ActionBar>
					<Button icon={<IcBack />} onClick={() => window.history.back()}>
						{t('Go back')}
					</Button>
					<Button onClick={onReset}>{t('Try again')}</Button>
					<Button
						color="primary"
						icon={<IcReload />}
						onClick={() => window.location.reload()}
					>
						{t('Reload page')}
					</Button>
				</ActionBar>
			}
		>
			<Text as="p">
				{t('An unexpected error occurred. You can try reloading the page or going back.')}
			</Text>
			{process.env.NODE_ENV !== 'production' && error && (
				<Disclosure summary={t('Error details')}>
					<Text as="div" size="xs" mono preWrap className="mh-sm scroll">
						{error.message}
						{error.stack && '\n\n' + error.stack}
					</Text>
				</Disclosure>
			)}
		</Dialog>
	)
}

// vim: ts=4
