// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

const APP_NAME = 'Formillo'

import dayjs from 'dayjs'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'
import '@cloudillo/fonts/fonts.css'
import '@cloudillo/react/components.css'

import { AppDocBar, Toasts, useApi, useCloudillo } from '@cloudillo/react'
import * as T from '@symbion/runtype'
import './i18n.js'

type FormValue = string | number | (string | number)[] | undefined
type FormData = Record<string, FormValue> & { _tm?: number; _ip?: string }

function EmptyState() {
	const { t } = useTranslation()
	return (
		<div className="m-container g-1">
			<div className="m-panel p-2">
				<p className="text-emph">{t('No form to display')}</p>
			</div>
		</div>
	)
}

function FormData({ data }: { data: FormData[] }) {
	const { t } = useTranslation()
	const rows = [...data].reverse()
	return (
		<div className="m-container g-1">
			{rows.map((row, idx) => (
				<div className="m-panel" key={idx}>
					<h2>
						{dayjs(row._tm).format('YYYY-MM-DD HH:mm:ss')} ({row._ip})
					</h2>
					<ul className="m-panel">
						{Object.entries(row)
							.filter(([key]) => key !== '_tm' && key !== '_ip')
							.map(([key, value]) => (
								<li key={key}>
									<b>{key}:</b> {String(value)}
								</li>
							))}
					</ul>
				</div>
			))}
			{!rows.length && <p>{t('No responses yet')}</p>}
		</div>
	)
}

export function App() {
	const cloudillo = useCloudillo(APP_NAME)
	const { api } = useApi()
	const [responses, setResponses] = React.useState<FormData[] | undefined>(undefined)
	const isAdmin = !!cloudillo?.roles?.includes('SADM')

	React.useEffect(
		function () {
			if (!api || !cloudillo || !isAdmin) return
			api.request(
				'GET',
				`/db/${cloudillo.fileId}`,
				T.struct({ data: T.array(T.unknown) })
			).then((json) => setResponses((json as { data: FormData[] }).data))
		},
		[api, cloudillo, isAdmin]
	)

	if (!cloudillo?.fileId) return <div>Loading...</div>
	if (isAdmin && responses === undefined) return <div>Loading...</div>

	// Both branches wear the bar — formillo has no chrome of its own. Presence
	// stays empty until RTDB grows a presence channel.
	return (
		<div className="c-vbox h-100">
			<AppDocBar />
			{isAdmin ? <FormData data={responses ?? []} /> : <EmptyState />}
			<Toasts />
		</div>
	)
}

// vim: ts=4
