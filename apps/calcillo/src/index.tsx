// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { CalcilloApp } from './app.js'

function App(_props: React.PropsWithChildren<object>) {
	return (
		<BrowserRouter basename="/">
			<CalcilloApp />
		</BrowserRouter>
	)
}

const app = document.getElementById('app')
const root = createRoot(app!)
root.render(<App />)

// vim: ts=4
