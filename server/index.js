
import {createServer} from 'node:http';
import {EZCCIP, error_with} from '@resolverworks/ezccip';
import {Record} from '@resolverworks/enson';
import {createCanvas, GlobalFonts} from '@napi-rs/canvas';
import {ethers} from 'ethers';
import {NFT} from './nft.js';

GlobalFonts.registerFromPath(new URL('./fonts/ShareTechMono-Regular.ttf', import.meta.url).pathname, 'Text');
GlobalFonts.registerFromPath(new URL('./fonts/NotoColorEmoji-Regular.ttf', import.meta.url).pathname, 'Emoji');
const FONT = 'Text, Emoji';

const PORT = 8017;
const BASENAME = 'xctens-eg.eth';
const PUBLIC_URL = 'https://home.antistupid.com/xctens-eg';
const CCIP_ENDPOINT = '/ccip';

const signingKey = new ethers.SigningKey('0xbd1e630bd00f12f0810083ea3bd2be936ead3b2fa84d1bd6690c77da043e9e02'); // d00d

const ezccip = new EZCCIP();
ezccip.enableENSIP10(name => {
	if (name === BASENAME) { // record for basename
		return Record.from({
			name: BASENAME,
			url: 'Mint your own at https://chonk.com',
			$op: NFT.contract.target, // this should be whatever chain the contract is deployed on
		});
	}
	if (!name.endsWith(BASENAME)) return;
	let label = name.slice(0, -(1 + BASENAME.length)); 
	if (label.includes('.')) return;
	return NFT.resolve(label);
});

const http = createServer(async (req, reply) => {
	try {
		let url = new URL(req.url, 'http://a');
		reply.setHeader('access-control-allow-origin', '*');
		switch (req.method) {
			case 'OPTIONS': return reply.setHeader('access-control-allow-headers', '*').end();
			case 'GET': {
				let match = url.pathname.slice(1).match(/^(metadata|image)\/(\d+)$/);
				if (match) {
					let action = match[1];
					let token = BigInt(match[2]);
					let record = await NFT.cached(token);
					if (record) {
						if (action === 'metadata') {
							return write_json(reply, create_metadata(token, record));
						} else {
							let canvas = create_image(token, record);
							let buf = await canvas.encode('png');
							reply.setHeader('content-length', buf.length);
							reply.setHeader('content-type', 'image/png');
							return reply.end(buf);
						}
					}
				}
				throw error_with('file not found', {status: 404});
			}
			case 'POST': {
				if (url.pathname === CCIP_ENDPOINT) {
					let {sender, data: calldata} = JSON.parse(await read_body(req));
					let {data, history} = await ezccip.handleRead(sender, calldata, {signingKey, resolver: determine_tor(url.search.slice(1))});
					console.log(history.toString());
					return write_json(reply, {data});
				}
				throw error_with('unknown request', {status: 400});
			}
			default: throw error_with('unsupported http method', {status: 405, method});
		}
	} catch (err) {
		let {message, status} = err;
		if (!status) {
			status = 500;
			message = 'unknown error';
			console.log(err);
		}
		write_json(reply, {message});
	}
});

http.listen(PORT).once('listening', () => {
	console.log(`Listening on ${http.address().port}`);
	console.log(`Signer: ${ethers.computeAddress(signingKey)}`);
	console.log(`Endpoint: ${PUBLIC_URL}${CCIP_ENDPOINT}`);
	console.log(`Basename: ${BASENAME}`);
});

function determine_tor(hint) {
	switch (hint) {
		case 's': return '0xf93F7F8002BcfB285D44E9Ef82E711cCD0D502A2'; // sepolia
		default:  return '0x84c5AdB77dd9f362A1a3480009992d8d47325dc3'; // mainnet
	}
}

function write_json(reply, json) {
	let buf = Buffer.from(JSON.stringify(json));
	reply.setHeader('content-length', buf.length);
	reply.setHeader('content-type', 'application/json');
	reply.end(buf);
}

async function read_body(req) {
	let v = [];
	for await (let x of req) v.push(x);
	return Buffer.concat(v);
}

function create_metadata(token, record) {
	let attributes = [];
	attributes.push({trait_type: 'Owner', value: record.owner});
	let avatar = record.text('avatar');
	if (avatar) attributes.push({trait_type: 'Avatar', value: avatar});
	let {evmAddress} = record;
	if (evmAddress) attributes.push({trait_type: 'EVM Address', value: evmAddress.value});
	return {
		id: token.toString(),
		name: `${record.name()}.${BASENAME}`,
		image: `${PUBLIC_URL}/image/${token}`,
		attributes,
	};
}

function create_image(token, record) {
	const S = 1000;
	const inset = Math.round(S * 0.05);
	const SS = S - inset*2;

	let canvas = createCanvas(S, S);
	let ctx = canvas.getContext('2d');

	let g = ctx.createLinearGradient(0, 0, S, S);
	g.addColorStop(0, '#666');
	g.addColorStop(1, '#111');

	ctx.fillStyle = g;
	ctx.fillRect(0, 0, S, S);

	ctx.fillStyle = '#fff';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'bottom';
	
	let name_info = compute_font_size(ctx, 256, record.name(), SS);
	let base_info = compute_font_size(ctx, 64, NFT.basename, S);

	ctx.fillStyle = '#fff';
	draw_text(ctx, name_info, inset, S - 2*inset - base_info.actualBoundingBoxAscent);
	ctx.globalAlpha = 0.5;
	draw_text(ctx, base_info, inset, S - inset);

	return canvas;
}

function compute_font_size(ctx, size, text, width) {
	while (true) {
		let font = ctx.font = `${size}px ${FONT}`;
		let info = ctx.measureText(text);
		if (info.width < width) {
			return Object.assign(info, {font, text})
		};
		--size;
	}
}

function draw_text(ctx, info, x, y) {
	ctx.font = info.font;
	ctx.fillText(info.text, x + info.actualBoundingBoxLeft, y - info.actualBoundingBoxDescent);
}
