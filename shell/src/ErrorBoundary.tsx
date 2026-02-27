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
import { useTranslation } from 'react-i18next'

import {
	LuCircleAlert as IcError,
	LuRefreshCw as IcReload,
	LuArrowLeft as IcBack
} from 'react-icons/lu'

import { Button } from '@cloudillo/react'

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
	const dialogRef = React.useRef<HTMLDialogElement>(null)

	// Use native dialog with showModal() for built-in focus trapping
	React.useEffect(() => {
		dialogRef.current?.showModal()
	}, [])

	return (
		<dialog
			ref={dialogRef}
			className="c-error-dialog"
			aria-labelledby="error-boundary-title"
			onCancel={(e) => e.preventDefault()}
		>
			<div className="c-card p-4" style={{ maxWidth: 480 }}>
				<div className="c-hbox align-items-center g-2 mb-3">
					<IcError size={32} className="text-error" />
					<h2 id="error-boundary-title" className="m-0">
						{t('Something went wrong')}
					</h2>
				</div>
				<p className="mb-4">
					{t(
						'An unexpected error occurred. You can try reloading the page or going back.'
					)}
				</p>
				{process.env.NODE_ENV !== 'production' && error && (
					<details className="mb-4">
						<summary className="text-muted" style={{ cursor: 'pointer' }}>
							{t('Error details')}
						</summary>
						<pre
							className="p-2 mt-2"
							style={{
								fontSize: '0.75rem',
								overflow: 'auto',
								maxHeight: '10rem',
								background: 'var(--col-surface)',
								borderRadius: 'var(--bd-radius)'
							}}
						>
							{error.message}
							{error.stack && '\n\n' + error.stack}
						</pre>
					</details>
				)}
				<div className="c-hbox g-2 justify-content-end">
					<Button onClick={() => window.history.back()}>
						<IcBack />
						{t('Go back')}
					</Button>
					<Button onClick={onReset}>{t('Try again')}</Button>
					<Button className="primary" onClick={() => window.location.reload()}>
						<IcReload />
						{t('Reload page')}
					</Button>
				</div>
			</div>
		</dialog>
	)
}

// vim: ts=4
