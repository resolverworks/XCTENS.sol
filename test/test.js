
import {Foundry, to_address} from '@adraffy/blocksmith';
import {ethers} from 'ethers';
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';

// hypothetical "server" that signs approval using god key
const god = ethers.Wallet.createRandom();
function whitelist(label, address) {
	label = ethers.ensNormalize(label);
	if ([...label].length < 4) throw new Error('too short');
	let hash = ethers.solidityPackedKeccak256(['address', 'address', 'string'], [god.address, address, label]);
	let proof = god.signingKey.sign(hash).serialized;
	return {label, proof};
}

// generate unique names
const unique = (function() { return `chonk${++this.n}`; }).bind({n: 0});

let foundry, nft, nft_owner;

before(async () => {
	foundry = await Foundry.launch();
	nft_owner = foundry.requireWallet('admin');
	nft = await foundry.deploy({file: 'XCTENS', args: [to_address(foundry.wallets.admin), to_address(god), 'Test', 'TEST', 'https://...']}, {
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

test('register a name w/proof', async T => {
	let {proof, label} = whitelist(unique(), to_address(foundry.wallets.admin));
	let avatar = 'https://raffy.antistupid.com/ens.jpg';
	let {token, owner, address} = await nft.$register(proof, label, {avatar});
	await T.test('check owner', async () => {
		assert.equal(await nft.ownerOf(token), owner);
	});
	await T.test('check name', async () => {
		assert.equal(await nft['name(uint256)'](token), label);
	});
	await T.test('check avatar', async () => {
		assert.equal(await nft.text(token, 'avatar'), avatar);
	});
	await T.test('check evm: addr(60)', async () => {
		assert.equal(ethers.getAddress(await nft.addr(token, 60)), address);
	});
	await T.test('check evm: addr(poly)', async () => {
		assert.equal(ethers.getAddress(await nft.addr(token, 0x80000000 + 139)), address);
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
	let {token} = await nft.$register(proof, label, {wallet: A});
	await T.test('check owner = A', async () => {
		assert.equal(await nft.ownerOf(token), to_address(A));
	});
	await foundry.confirm(nft.connect(A).safeTransferFrom(to_address(A), to_address(B), token));
	await T.test('check owner = B', async () => {
		assert.equal(await nft.ownerOf(token), to_address(B));
	});
	await T.test('check address', async () => {
		assert.equal(ethers.getAddress(await nft.addr(token, 60)), to_address(B));
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
