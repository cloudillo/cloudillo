// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * FROZEN golden document (ideallo 1.0), base64 Yjs updates. Never regenerate or edit: a later
 * release adds a new fixture beside this one. Content: `m.schema` (1, or 999 in FUTURE_SCHEMA),
 * `o.known` = { t: 'R', xy: [1, 2], wh: [30, 40], qq: 7 } (unknown key `qq`),
 * `o.future` = { t: 'Z', xy: [3, 4], wh: [50, 60], zz: { future: true } } (unknown type),
 * `r` = ['known', 'future'].
 */

export const GOLDEN_1_0 =
	'AQT5vJSmAgAoAQFtBnNjaGVtYQF9ASgBAW8Fa25vd24BdgQBdHcBUgJ4eXUCfQF9AgJ3aHUCfR59KAJxcX0HKAEBbwZmdXR1cmUBdgQBdHcBWgJ4eXUCfQN9BAJ3aHUCfTJ9PAJ6enYBBmZ1dHVyZXgIAQFyAncFa25vd253BmZ1dHVyZQA='

export const GOLDEN_1_0_FUTURE_SCHEMA =
	'AQTg4oD9CgAoAQFtBnNjaGVtYQF9pw8oAQFvBWtub3duAXYEAXR3AVICeHl1An0BfQICd2h1An0efSgCcXF9BygBAW8GZnV0dXJlAXYEAXR3AVoCeHl1An0DfQQCd2h1An0yfTwCenp2AQZmdXR1cmV4CAEBcgJ3BWtub3dudwZmdXR1cmUA'

// vim: ts=4
