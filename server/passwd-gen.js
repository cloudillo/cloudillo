import crypto from 'crypto'

if (process.argv.length < 4) {
	console.log('Usage: node passwd-gen.js <identityTag> <password>')
	process.exit(1)
}

const identityTag = process.argv[2]
const passwd = process.argv[3]

const salt = crypto.randomBytes(16)
const hashed = crypto.scryptSync(passwd, salt, 64).toString('base64url')

const passwordData = `${salt.toString('base64url')}:${hashed}`
console.log(passwordData)

console.log('\nsqlite3 data/priv/auth.db')
console.log(`INSERT INTO users (password, status, userTag, userName, email, tnId)
	VALUES ('${passwordData}', 'A', '${identityTag}', '${identityTag.split('.')[0]}', '${identityTag.replace(/\./, '@')}', 0);`);
