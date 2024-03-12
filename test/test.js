
import {Foundry, to_address} from '@adraffy/blocksmith';
import {ethers} from 'ethers';
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';

let foundry, chonk;

before(async () => {
	foundry = await Foundry.launch();	
	chonk = await foundry.deploy({name: 'XCTENS', args: [foundry.wallet(0).address, 'Chonk', 'CHONK', 'https://...']}, {
		async $register(label, {wallet = 0, owner, address, avatar = '', } = {}) {
			wallet = foundry.wallet(wallet);
			if (!owner) owner = to_address(wallet);
			if (!address) address = owner;
			await foundry.confirm(this.connect(wallet).register(label, owner, address, avatar));
			let token = await this.tokenFor(label);
			return {label, token, owner, address};
		}
	});
});
after(() => foundry.shutdown());

test('register a name', async T => {
	let avatar = 'https://raffy.antistupid.com/ens.jpg';
	let {label, token, owner, address} = await chonk.$register('raffy', {avatar});

	await T.test('check owner', async () => {
		assert.equal(owner, await chonk.ownerOf(token));
	});
	await T.test('check name', async () => {
		assert.equal(label, await chonk['name(uint256)'](token));
	});
	await T.test('check avatar', async () => {
		assert.equal(avatar, await chonk.text(token, 'avatar'));
	});
	await T.test('check evm: addr(60)', async () => {
		assert.equal(address, ethers.getAddress(await chonk.addr(token, 60)));
	});
	await T.test('check evm: addr(poly)', async () => {
		assert.equal(address, ethers.getAddress(await chonk.addr(token, 0x80000000 + 139)));
	});
});

test('transfer a name', async T => {
	let A = foundry.wallet(0);
	let B = foundry.wallet(1);
	let {token} = await chonk.$register('slobo', {wallet: A});
	await T.test('check owner = A', async () => {
		assert.equal(to_address(A), await chonk.ownerOf(token));
	});
	await foundry.confirm(chonk.safeTransferFrom(to_address(A), to_address(B), token));
	await T.test('check owner = B', async () => {
		assert.equal(to_address(B), await chonk.ownerOf(token));
	});
	await T.test('check address', async () => {
		assert.equal(to_address(B), ethers.getAddress(await chonk.addr(token, 60)));
	});
});
