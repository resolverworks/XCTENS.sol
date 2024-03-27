import {NFT} from './nft.js';

//console.log(await NFT.fetch(NFT.tokenFor('asldjaiufsh')));
//console.log(await NFT.fetch(NFT.tokenFor('chonk')));

console.log(await NFT.cached(NFT.tokenFor('chonk')).then(x => x.toJSON()));
console.log(await NFT.cached(81997842440526139949952485234787715507735810471042292174910460555057654704299n).then(x => x.toJSON()));
