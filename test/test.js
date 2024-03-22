
import {Foundry, to_address} from '@adraffy/blocksmith';
import {ethers} from 'ethers';
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';

// evm address coin type
const EVM_CTY = ethers.id('universal');

// unique name generator
const unique = (function() { return `chonk${++this.n}`; }).bind({n: 0});

// hypothetical "server" that signs approval using god key
const god = ethers.Wallet.createRandom();
function whitelist(label, address) {
	label = ethers.ensNormalize(label);
	if ([...label].length < 4) throw new Error('too short');
	let hash = ethers.solidityPackedKeccak256(['address', 'address', 'string'], [god.address, address, label]);
	let proof = god.signingKey.sign(hash).serialized;
	return {label, proof};
}

const args0 = {
	name: 'Test',
	symbol: 'TEST',
	url: 'https://...'
};

let foundry, nft, nft_owner;

before(async () => {
	foundry = await Foundry.launch();
	nft_owner = foundry.requireWallet('admin');
	nft = await foundry.deploy({file: 'XCTENS', args: [to_address(foundry.wallets.admin), to_address(god), args0.name, args0.symbol, args0.url]}, {
		async $register(proof, label, {wallet = nft_owner, owner, address, avatar = ''} = {}) {
			wallet = foundry.requireWallet(wallet);
			if (!owner) owner = to_address(wallet);
			if (!address) address = owner;
			await foundry.confirm(this.connect(wallet).register(proof, label, owner, address, avatar));
			let token = await this.tokenFor(label);
			return {token, owner, address, avatar};
		}
	});
});
after(() => foundry.shutdown());

test('simple checks', async T => {
	await T.test('owner', async () => assert.equal(await nft.owner(), to_address(foundry.wallets.admin)));
	await T.test('signer', async () => assert.equal(await nft.signer(), to_address(god)));
	await T.test('uri', async () => assert.equal(await nft.baseUri(), args0.url));
	await T.test('name', async () => assert.equal(await nft['name()'](), args0.name));
	await T.test('symbol', async () => assert.equal(await nft['symbol()'](), args0.symbol));
});

test('register a name w/proof', async T => {
	let {proof, label} = whitelist(unique(), to_address(foundry.wallets.admin));
	let avatar = 'https://raffy.antistupid.com/ens.jpg';
	await T.test('check available = true', async () => {
		assert.equal(await nft.available(label), true);
	});
	let {token, owner, address} = await nft.$register(proof, label, {avatar});	
	await T.test('check available = false', async () => {
		assert.equal(await nft.available(label), false);
	});
	await T.test('check owner', async () => {
		assert.equal(await nft.ownerOf(token), owner);
	});
	await T.test('check name', async () => {
		assert.equal(await nft['name(uint256)'](token), label);
	});
	await T.test('check avatar', async () => {
		assert.equal(await nft.text(token, 'avatar'), avatar);
	});
	await T.test('check evm', async () => {
		assert.equal(await nft.addr(token, EVM_CTY), address.toLowerCase());
	});
	await T.test('check evm: addr(60)', async () => {
		assert.equal(await nft.addr(token, 60), address.toLowerCase());
	});
	await T.test('check evm: addr(poly)', async () => {
		assert.equal(await nft.addr(token, 0x80000000 + 139), address.toLowerCase());
	});
});

test('register to 0x0', async T => {
	let {proof, label} = whitelist(unique(), to_address(foundry.wallets.admin));
	await assert.rejects(() => nft.$register(proof, label, {owner: ethers.ZeroAddress}));
});

test('evm address', async T => {
	let {proof, label} = whitelist(unique(), to_address(foundry.wallets.admin));
	let {token, address} = await nft.$register(proof, label);
	await T.test('addr(60) != 0', async () => {
		assert.equal(await nft.addr(token, 60), address.toLowerCase());
	});
	await T.test('clear evm', async () => {
		await foundry.confirm(nft.setAddr(token, EVM_CTY, '0x'));
	});
	await T.test('addr(60) == 0', async () => {
		assert.equal(await nft.addr(token, 60), '0x');
	});
});

test('wrong proof', async T => {
	let unnorm = 'Uppercase';
	let {proof, label} = whitelist(unnorm, to_address(foundry.wallets.admin));
	await T.test('not normalized', () => assert.notEqual(unnorm, label));
	await T.test('register fails', () => assert.rejects(nft.$register(proof, unnorm)));
});

test('transfer a name', async T => {
	let A = await foundry.ensureWallet('A');
	let B = await foundry.ensureWallet('B');
	let {proof, label} = whitelist(unique(), to_address(A));
	let {token, avatar} = await nft.$register(proof, label, {wallet: A, avatar: 'chonk'});
	await T.test('check owner = A', async () => {
		assert.equal(await nft.ownerOf(token), to_address(A));
	});
	await T.test('check avatar is set', async () => {
		assert.equal(await nft.text(token, 'avatar'), avatar);
	});
	await foundry.confirm(nft.connect(A).safeTransferFrom(to_address(A), to_address(B), token));
	await T.test('check owner = B', async () => {
		assert.equal(await nft.ownerOf(token), to_address(B));
	});
	await T.test('check avatar is unset', async () => {
		assert.equal(await nft.text(token, 'avatar'), '');
	});
	await T.test('check address set automatically', async () => {
		assert.equal(ethers.getAddress(await nft.addr(token, 60)), to_address(B));
	});
	await foundry.confirm(nft.connect(B).safeTransferFrom(to_address(B), to_address(A), token));
	await T.test('check avatar is restored', async () => {
		assert.equal(await nft.text(token, 'avatar'), avatar);
	});
});

test('multicall read', async () => {
	let abi = nft.interface;
	let frag = abi.getFunction('name(uint256)');
	let m = [];
	for (let i = 0; i < 5; i++) {
		let {proof, label} = whitelist(unique(), to_address(foundry.wallets.admin));
		let {token} = await nft.$register(proof, label);
		let call = abi.encodeFunctionData(frag, [token]);
		m.push({token, label, call});
	}
	let answers = await nft.multicall.staticCall(m.map(x => x.call));
	let labels = answers.map(x => {
		let [label] = abi.decodeFunctionResult(frag, x);
		return label;
	});
	assert.deepEqual(labels, m.map(x => x.label));
});

test('multicall write', async () => {
	let {proof, label} = whitelist(unique(), to_address(foundry.wallets.admin));
	let {token} = await nft.$register(proof, label);
	let m = [
		{get: 'text', set: 'setText', args: ['chonk', 'Chonker']},
		{get: 'text', set: 'setText', args: ['description', '1 chonk']},
		{get: 'addr', set: 'setAddr', args: [60, '0x51050ec063d393217b436747617ad1c2285aeeee']},
		{get: 'contenthash', set: 'setContenthash', args: ['0x1234']}
	];
	let calls = await Promise.all(m.map(({set, args}) => {
		return nft[set].populateTransaction(token, ...args).then(x => x.data);
	}));
	await foundry.confirm(nft.multicall(calls));
	for (let {get, args} of m) {
		assert.equal(await nft[get](token, ...args.slice(0, -1)), args.at(-1));
	}
});

test('multcall write fail', async () => {
	let calls = [
		nft.setText.populateTransaction(69420, 'name', 'Chonk').then(x => x.data)
	];
	await assert.rejects(() => foundry.confirm(nft.multicall(calls)));
});

test('setRecords', async T => {
	let {proof, label} = whitelist(unique(), to_address(foundry.wallets.admin));
	let {token} = await nft.$register(proof, label);
	let texts = [
		['name', 'Chonk'], 
		['chonk', 'yes']
	];
	let addrs = [
		[60, '0x51050ec063d393217b436747617ad1c2285aeeee'],
		[0, '0x00142e6414903e4b24d05132352f71b75c165932a381'],
	];
	let chash = '0xe301017012201687de19f1516b9e560ab8655faa678e3a023ebff43494ac06a36581aafc957e';
	await T.test('set', async () => {
		await foundry.confirm(nft.setRecords(token, texts, addrs, [chash]));
		for (let [k, v] of texts) {
			assert.equal(await nft.text(token, k), v);
		}
		for (let [k, v] of addrs) {
			assert.equal(await nft.addr(token, k), v);
		}
		assert.equal(await nft.contenthash(token), chash);
	});
	await T.test('empty', async () => {
		await foundry.confirm(nft.setRecords(token, [], [], []));
		assert.equal(await nft.contenthash(token), chash); // unchanged
	});
	await T.test('clear', async () => {
		let keys = texts.map(v => v[0]);
		let coins = addrs.map(v => v[0]);
		coins.push(EVM_CTY); // clear evm too
		await foundry.confirm(nft.setRecords(token, keys.map(x => [x, '']), coins.map(x => [x, '0x']), ['0x']));
		for (let [k] of texts) {
			assert.equal(await nft.text(token, k), '');
		}
		for (let [k] of addrs) {
			assert.equal(await nft.addr(token, k), '0x');
		}
		assert.equal(await nft.contenthash(token), '0x');
	});
});
