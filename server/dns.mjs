import bns from 'bns'

const resolver = new bns.RecursiveResolver({
	minimize: true,
})

resolver.hints.setDefault()

resolver.on('log', (...args) => console.log(...args))

const res = await resolver.lookup(process.argv[2], 'A')
console.log(res)

const ans = res.answer.pop()?.data?.address

console.log(ans)
//console.log(res.toString())
