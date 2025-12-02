import * as React from 'react'
import { Button } from '@cloudillo/react'

export function ThemeSwitcher() {
	const [theme, setTheme] = React.useState(
		() => localStorage.getItem('storybook-theme') || 'glass'
	)
	const [mode, setMode] = React.useState(() => localStorage.getItem('storybook-mode') || 'light')

	React.useEffect(() => {
		document.body.className = `theme-${theme} ${mode}`
		localStorage.setItem('storybook-theme', theme)
		localStorage.setItem('storybook-mode', mode)
	}, [theme, mode])

	function toggleTheme() {
		setTheme((t) => (t === 'glass' ? 'opaque' : 'glass'))
	}

	function toggleMode() {
		setMode((m) => (m === 'light' ? 'dark' : 'light'))
	}

	return (
		<div className="theme-switcher">
			<Button
				link
				onClick={toggleMode}
				title={mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
			>
				{mode === 'light' ? '🌙' : '☀️'}
			</Button>
			<Button
				link
				onClick={toggleTheme}
				title={theme === 'glass' ? 'Switch to opaque theme' : 'Switch to glass theme'}
			>
				{theme === 'glass' ? '🪟' : '⬛'}
			</Button>
		</div>
	)
}

// vim: ts=4
