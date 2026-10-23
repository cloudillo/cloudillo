// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

// A leaf module (types only), so the message-bus handlers can read it without pulling in
// manifest-registry.ts and its icon registry / React.
import type { AppConfigState } from './utils.js'

/**
 * Apps the server administrator has turned off (today only Mapillo, by an empty or missing
 * `map.tile_sources`). Filled at boot by `applyUiSettings()` in `auth/boot.ts`.
 * The MIME map keeps them, so opening such a file reaches `ExternalApp`, which explains.
 *
 * UI only, not access control: the app bundle URL still loads. `map.tile_sources` is a
 * home-node setting and `applyUiSettings()` re-runs per idTag, so this is not context-dependent.
 */
export const disabledApps = new Set<string>()

/** An empty or missing `map.tile_sources` turns Mapillo off (boot passes `[]` for a 404);
 *  anything else turns it on */
export function applyTileSourcesSetting(value: unknown) {
	if (Array.isArray(value) && value.length === 0) disabledApps.add('mapillo')
	else disabledApps.delete('mapillo')
}

/** `config` without the disabled apps in its app list and launcher menu */
export function withoutDisabledApps(config: AppConfigState): AppConfigState {
	if (!disabledApps.size) return config
	const menu = config.menu.filter((item) => !disabledApps.has(item.id))
	return {
		...config,
		apps: config.apps.filter((app) => !disabledApps.has(app.id)),
		menu,
		defaultMenu:
			config.defaultMenu && disabledApps.has(config.defaultMenu)
				? menu[0]?.id
				: config.defaultMenu
	}
}

// vim: ts=4
