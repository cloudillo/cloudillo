const fs = require('fs')
const path = require('path')

// Cache of local package names found in local/ directory
let localPackages = null

function getLocalPackages() {
	if (localPackages !== null) return localPackages

	localPackages = new Set()
	const localDir = path.join(__dirname, 'local')

	if (!fs.existsSync(localDir)) return localPackages

	for (const entry of fs.readdirSync(localDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue

		const pkgJsonPath = path.join(localDir, entry.name, 'package.json')
		if (fs.existsSync(pkgJsonPath)) {
			try {
				const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
				if (pkgJson.name) {
					localPackages.add(pkgJson.name)
				}
			} catch (e) {
				// Ignore invalid package.json
			}
		}
	}

	return localPackages
}

function readPackage(pkg, context) {
	const locals = getLocalPackages()

	for (const depType of ['dependencies', 'devDependencies', 'peerDependencies']) {
		if (!pkg[depType]) continue

		for (const depName of Object.keys(pkg[depType])) {
			if (locals.has(depName)) {
				pkg[depType][depName] = 'workspace:*'
			}
		}
	}

	return pkg
}

module.exports = {
	hooks: {
		readPackage
	}
}
// vim: ts=4
