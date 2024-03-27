import {ethers} from 'ethers';
import {XCTENS} from './XCTENS.js';

export const NFT = new XCTENS({
	//provider: new ethers.JsonRpcProvider('https://sepolia-rollup.arbitrum.io/rpc', 421614, {staticNetwork: true}), 
	//contract: '0xcdB7fafde2212ec26F58F275FedF07a6Ef69814c',
	provider: new ethers.JsonRpcProvider('https://sepolia.base.org', 84532, {staticNetwork: true}),
	contract: '0x6f390c35b8b96dfdf42281cec36f1226eed87c6b',
	basename: 'xctens-eg.eth'
});
