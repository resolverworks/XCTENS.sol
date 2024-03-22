import {ethers} from 'ethers';

const provider = new ethers.JsonRpcProvider(process.env.PROVIDER_URL);
const signer = new ethers.Wallet(process.env.CLIENT_PRIVATE_KEY, provider);
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, [
	'function tokenFor(string label) view returns (uint256)',
	'function ownerOf(uint256 token) view returns (address)',
	'function setRecords(uint256 token, (string, string)[] texts, (uint256, bytes)[] addrs, bytes[] chash)',
], signer);

// const contract = new ethers.Contract('0xdfc5bb5032889BABA9157CAD26C79ceC740D7528', [
// 	'function tokenFor(string label) view returns (uint256)',
// 	'function multicall(bytes[]) returns (bytes[])',
// 	'function setText(uint256 token, string key, string value)',
// 	'function setAddr(uint256 token, uint256 cty, bytes value)',
// 	'function setContenthash(uint256 token, bytes value)',
// ], signer);

const token = await contract.tokenFor('chonk');
const owner = await contract.ownerOf(token);

console.log({
	signer: signer.address,
	token,
	owner,
	owned: owner === signer.address
});

// let m = [
// 	{set: 'setText', args: ['chonk', 'Chonker']},
// 	{set: 'setText', args: ['description', '1 chonk']},
// 	{set: 'setAddr', args: [60, '0x51050ec063d393217B436747617aD1C2285Aeeee']},
// 	{set: 'setContenthash', args: ['0xe301017012201687de19f1516b9e560ab8655faa678e3a023ebff43494ac06a36581aafc957e']}
// ];
// let calls = await Promise.all(m.map(({set, args}) => {
// 	return contract[set].populateTransaction(token, ...args).then(x => x.data);
// }));
// let tx = await contract.multicall(calls);

let tx = await contract.setRecords(token, 
	[['chonk', 'Big Chonkus']], 
	[[60, '0x51050ec063d393217B436747617aD1C2285Aeeee']], 
	['0xe301017012201687de19f1516b9e560ab8655faa678e3a023ebff43494ac06a36581aafc957e']
);

console.log(tx.hash);
console.log(await tx.wait());
