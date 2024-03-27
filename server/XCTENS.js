import {Record, Address, Coin} from '@resolverworks/enson';
import {ethers} from 'ethers';

const NFT_ABI = new ethers.Interface([
	'function ownerOf(uint256) returns (address)',
	'function name(uint256) returns (string)',
	'function text(uint256, string) returns (string)',
	'function addr(uint256, uint256) returns (bytes)',
	'function contenthash(uint256) returns (bytes)',
]);

const EVM_CTY = BigInt('0x06e0989d8168c3a954e5b385b12a16a30139850a1596d8de0f6ecfc92bed71a8');

const TEXTS = [
	'name',
	'location',
	'email',
	'url',
	'avatar',
	'description',
	'keywords',
	'com.discord',
	'com.github',
	'com.reddit',
	'com.twitter',
	'org.telegram',
	'notice',
	'farcaster',
];

const COINS = ['eth', 'btc', 'bnb', 'doge', 'ltc', 'dot', 'sol', 'arb1', 'op', 'base'];

class XCTENSRecord extends Record {
	get evmAddress() {
		let v = super.addr(EVM_CTY);
		if (v) return Address.from(v); // return as eth address
	}
	addr(type) {
		let v = super.addr(type);
		if (!v && Coin.fromType(type).chain) {
			v = super.addr(EVM_CTY);
		}
		return v
	}
}

export class XCTENS {
	constructor({provider, contract, basename, fields = [], ...a}) {
		this.contract =  new ethers.Contract(contract, [
			'function multicall(bytes[]) view returns (bytes[])'
		], provider);
		this.basename = basename;
		this.cache = new Map();
		this.fields = [
			{func: 'ownerOf', setter: (r, x) => r.owner = x},
			{func: 'name', setter: (r, x) => r.setName(x) },
			...TEXTS.map(x => ({func: 'text', arg: x})),
			...COINS.map(x => ({func: 'addr', arg: Coin.fromName(x).type})),
			...fields,
			{func: 'addr', arg: EVM_CTY},
		];
		Object.assign(this, a);
	}
	tokenFor(name) {
		return BigInt(ethers.id(name));
	}
	async resolve(name) {
		let {basename} = this;
		if (name === basename) return this.baseRecord?.();
		if (!name.endsWith(basename)) return;
		let label = name.slice(0, -(1 + basename.length)); 
		if (label.includes('.')) return;
		return this.cached(this.tokenFor(label));
	}
	async cached(token) {
		let {cache} = this;
		let p = cache.get(token);
		if (Array.isArray(p)) {
			let [t, res] = p;
			if (Date.now() - t < 60000) return res;
			p = null;
		}
		if (!p) {
			p = this.fetch(token).catch(() => {}).then(res => {
				cache.set(token, [Date.now(), res]);
				return res;
			});
			cache.set(token, p);
		}
		return p;
	}
	async fetch(token) {
		let {fields, contract} = this;
		let calls = fields.map(({func, arg}) => {
			let args = [token];
			if (arg !== undefined) args.push(arg);
			return NFT_ABI.encodeFunctionData(func, args);
		});
		let answers = await contract.multicall(calls);
		let record = new XCTENSRecord();
		fields.forEach(({func, arg, setter}, i) => {
			try {
				let [res] = NFT_ABI.decodeFunctionResult(func, answers[i]);
				if (setter) {
					setter(record, res);
				} else if (func === 'text') {
					record.setText(arg, res);
				} else if (func === 'addr') {
					record.setAddress(arg, ethers.getBytes(res));
				} else if (func === 'contenthash') {
					record.setChash(ethers.getBytes(res));
				}
			} catch (err) {
			}
		});
		return record;
	}
}
