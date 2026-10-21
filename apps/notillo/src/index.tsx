// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as React from 'react'
import './i18n.js'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { NotilloApp } from './app.js'

function App() {
	return (
		<BrowserRouter basename="/">
			<NotilloApp />
		</BrowserRouter>
	)
}

const app = document.getElementById('app')
const root = createRoot(app!)
root.render(<App />)

// vim: ts=4
