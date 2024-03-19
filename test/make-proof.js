import {ethers} from 'ethers';

// same demo key as TOR
const signingKey = new ethers.SigningKey('0xbd1e630bd00f12f0810083ea3bd2be936ead3b2fa84d1bd6690c77da043e9e02'); 
const signer = ethers.computeAddress(signingKey);
console.log({signer});

function whitelist(label, address) {
	label = ethers.ensNormalize(label);
	if ([...label].length < 4) throw new Error('too short');
	let hash = ethers.solidityPackedKeccak256(['address', 'address', 'string'], [signer, address, label]);
	let proof = signingKey.sign(hash).serialized;
	return {label, proof, address};
}

console.log(whitelist('raffy', '0x51050ec063d393217B436747617aD1C2285Aeeee'));
