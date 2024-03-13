
import {Foundry, to_address} from '@adraffy/blocksmith';
import {ethers} from 'ethers';
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';

let god = ethers.Wallet.createRandom();

function whitelist(label) {
	label = ethers.ensNormalize(label);
	if ([...label].length < 4) throw new Error('too short');
	let hash = ethers.solidityPackedKeccak256(['address', 'string'], [god.address, label]);
	let proof = god.signingKey.sign(hash).serialized;
	return {label, proof};
}

let unique = (function() { return this.n++ }).bind({n: 0});

let foundry, nft;

before(async () => {
	foundry = await Foundry.launch();	
	nft = await foundry.deploy({name: 'XCTENS', args: [foundry.wallet(0).address, god.address, 'Test', 'TEST', 'https://...']}, {
		async $register(proof, label, {wallet = 0, owner, address, avatar = ''} = {}) {
			wallet = foundry.wallet(wallet);
			if (!owner) owner = to_address(wallet);
			if (!address) address = owner;
			await foundry.confirm(this.connect(wallet).register(proof, label, owner, address, avatar));
			let token = await this.tokenFor(label);
			return {token, owner, address};
		}
	});
});
after(() => foundry.shutdown());

test('register a name w/proof', async T => {
	let {proof, label} = whitelist('Raffy');
	let avatar = 'https://raffy.antistupid.com/ens.jpg';
	let {token, owner, address} = await nft.$register(proof, label, {avatar});

	await T.test('check owner', async () => {
		assert.equal(owner, await nft.ownerOf(token));
	});
	await T.test('check name', async () => {
		assert.equal(label, await nft['name(uint256)'](token));
	});
	await T.test('check avatar', async () => {
		assert.equal(avatar, await nft.text(token, 'avatar'));
	});
	await T.test('check evm: addr(60)', async () => {
		assert.equal(address, ethers.getAddress(await nft.addr(token, 60)));
	});
	await T.test('check evm: addr(poly)', async () => {
		assert.equal(address, ethers.getAddress(await nft.addr(token, 0x80000000 + 139)));
	});
});

test('wrong proof', async T => {
	let unnorm = 'Uppercase';
	let {proof, label} = whitelist(unnorm);
	await T.test('not normalized', () => assert.notEqual(unnorm, label));
	await T.test('register fails', () => assert.rejects(nft.$register(proof, unnorm)));
});

test('transfer a name', async T => {
	let A = foundry.wallet(0);
	let B = foundry.wallet(1);
	let {proof, label} = whitelist('sLoBO');
	let {token} = await nft.$register(proof, label, {wallet: A});
	await T.test('check owner = A', async () => {
		assert.equal(to_address(A), await nft.ownerOf(token));
	});
	await foundry.confirm(nft.safeTransferFrom(to_address(A), to_address(B), token));
	await T.test('check owner = B', async () => {
		assert.equal(to_address(B), await nft.ownerOf(token));
	});
	await T.test('check address', async () => {
		assert.equal(to_address(B), ethers.getAddress(await nft.addr(token, 60)));
	});
});
