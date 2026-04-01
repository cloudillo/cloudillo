// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { App } from './app.js'

function AppContainer(_props: React.PropsWithChildren<object>) {
	return (
		<BrowserRouter basename="/">
			<App />
		</BrowserRouter>
	)
}

const app = document.getElementById('app')
const root = createRoot(app!)
root.render(<AppContainer />)

// vim: ts=4
