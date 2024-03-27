import {ethers} from 'ethers';

const signingKey = new ethers.SigningKey(process.env.SERVER_PRIVATE_KEY); 
function whitelist(label, address) {
	label = ethers.ensNormalize(label);
	if ([...label].length < 4) throw new Error('too short');
	let hash = ethers.solidityPackedKeccak256(['address', 'address', 'string'], [ethers.computeAddress(signingKey), address, label]);
	let proof = signingKey.sign(hash).serialized;
	return {label, proof, address};
}

//console.log(whitelist('raffy', '0x51050ec063d393217B436747617aD1C2285Aeeee'));

const provider = new ethers.JsonRpcProvider(process.env.PROVIDER_URL);
const signer = new ethers.Wallet(process.env.CLIENT_PRIVATE_KEY, provider);
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, [
	'function register(bytes proof, string label, address owner, address address0, string avatar0)',
], signer);

let {label, proof} = whitelist('💩️🚀️abc', signer.address);
console.log({label, proof});

let tx = await contract.register(proof, label, signer.address, signer.address, '');

console.log(tx.hash);
console.log(await tx.wait());
