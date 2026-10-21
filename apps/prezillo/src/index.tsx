// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import './i18n.js'

import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { PrezilloApp } from './app.js'

function App(_props: React.PropsWithChildren<object>) {
	return (
		<BrowserRouter basename="/">
			<PrezilloApp />
		</BrowserRouter>
	)
}

const app = document.getElementById('app')
const root = createRoot(app!)
root.render(<App />)

// Debug: log when index loads
console.log('Prezillo index.tsx loaded')

// vim: ts=4
