/// @author raffy.eth
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

// bases
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Pausable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// libraries
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract XCTENS is ERC721, ERC721Pausable, Ownable {

	function supportsInterface(bytes4 x) public view override(ERC721) returns (bool) {
		return super.supportsInterface(x);
	}

	error Unauthorized();

	event Registered(uint256 indexed token, string name, address owner);
	event TextChanged(uint256 indexed token, string key, string value);
	event AddrChanged(uint256 indexed token, uint256 cty, bytes value);
	event ContenthashChanged(uint256 indexed token, bytes value);

	struct Text { string key; string value; }
	struct Addr { uint256 cty; bytes value; }

	// https://adraffy.github.io/keccak.js/test/demo.html#algo=keccak-256&s=universal&escape=1&encoding=utf8
	uint256 constant EVM_CTY = 0x06e0989d8168c3a954e5b385b12a16a30139850a1596d8de0f6ecfc92bed71a8; // | 0x8000000 = 0

	uint256 public totalSupply;
	string public baseUri;
	address public signer;
	mapping(bytes32 => mapping(string => string)) _texts;
	mapping(bytes32 => mapping(uint256 => bytes)) _addrs;
	mapping(bytes32 => bytes) _chashes;
	mapping(uint256 => string) _names;

	constructor(
		address _owner,
		address _signer,
		string memory _name,
		string memory _symbol,
		string memory _baseUri
	) ERC721(_name, _symbol) Ownable(_owner) {
		baseUri = _baseUri;
		signer = _signer;
	}
	
	function _baseURI() internal view override returns (string memory) {
		return baseUri;
	}
	function setBaseURI(string memory _baseUri) external onlyOwner {
		baseUri = _baseUri;
	}
	function setSigner(address _signer) external onlyOwner {
		signer = _signer;
	}

	// ERC721Pausable
	function pause() external onlyOwner {
		_pause();
	}
	function unpause() external onlyOwner {
		_unpause();
	}
	
	// utils
	function _nodeFromParts(address owner, uint256 token) internal pure returns (bytes32) {
		return keccak256(abi.encodePacked(token, owner));
	}
	function _node(uint256 token) internal view returns (bytes32) {
		return _nodeFromParts(_ownerOf(token), token);
	}

	// ERC721
	function _update(address to, uint256 token, address auth) internal override(ERC721, ERC721Pausable) returns (address ret) {
		address prior = _ownerOf(token);
		ret = super._update(to, token, auth); // execute the trade
		if (prior != address(0)) { // on trade, auto-enable evm address from owner...
			if (_addrs[_node(token)][EVM_CTY].length == 0) { // ...if unset
				_setAddr(token, EVM_CTY, abi.encodePacked(to));
			}
		}
	}

	// registration
	function _tokenFromLabel(string memory label) internal pure returns (uint256) {
		return uint256(keccak256(abi.encodePacked(label)));
	}
	function tokenFor(string calldata label) external pure returns (uint256) {
		return _tokenFromLabel(label);
	}
	function available(string calldata label) external view returns (bool) {
		return _ownerOf(_tokenFromLabel(label)) == address(0);
	}

	function register(bytes calldata proof, string calldata label, address owner, Text[] calldata texts, Addr[] calldata addrs, bytes calldata chash) external {
		address signed = ECDSA.recover(keccak256(abi.encodePacked(signer, owner, label)), proof);
		if (signed != signer) revert Unauthorized();
		uint256 token = _tokenFromLabel(label);
		_safeMint(owner, token); // This will fail if the node is already registered
		_names[token] = label; // reverse name
		totalSupply++;
		emit Registered(token, label, owner);
		_setAddr(token, EVM_CTY, abi.encodePacked(owner));
		for (uint256 i; i < texts.length; i += 1) {
			_setText(token, texts[i].key, texts[i].value);
		}
		for (uint256 i; i < addrs.length; i += 1) {
			_setAddr(token, addrs[i].cty, addrs[i].value);
		}
		if (chash.length != 0) {
			_setContenthash(token, chash);
		}
	}

	// unsafe setters
	function _setAddr(uint256 token, uint256 cty, bytes memory value) internal {
		_addrs[_node(token)][cty] = value;
		emit AddrChanged(token, cty, value);
	}
	function _setText(uint256 token, string memory key, string memory value) internal {
		_texts[_node(token)][key] = value;
		emit TextChanged(token, key, value);
	}
	function _setContenthash(uint256 token, bytes memory value) internal {
		_chashes[_node(token)] = value;
		emit ContenthashChanged(token, value);
	}

	// record getters
	function addr(uint256 token, uint256 cty) external view returns (bytes memory) {
		return _addrs[_node(token)][cty];
	}
	function text(uint256 token, string calldata key) external view returns (string memory) {
		return _texts[_node(token)][key];
	}
	function contenthash(uint256 token) external view returns (bytes memory) {
		return _chashes[_node(token)];
	}
	function name(uint256 token) external view returns (string memory) {
		return _names[token];
	}

	// record setters
	modifier requireOwner(uint256 token) {
		if (_ownerOf(token) != msg.sender) revert Unauthorized();
		_;
	}
	function setAddr(uint256 token, uint256 cty, bytes calldata value) external requireOwner(token) {
		_setAddr(token, cty, value);
	}
	function setText(uint256 token, string calldata key, string calldata value) external requireOwner(token) {
		_setText(token, key, value);
	}
	function setContenthash(uint256 token, bytes calldata value) external requireOwner(token) {
		_setContenthash(token, value);
	}

	// traditional multicall
	function multicall(bytes[] calldata calls) external returns (bytes[] memory answers) {
		unchecked {
			uint256 n = calls.length;
			answers = new bytes[](n);
			for (uint256 i; i < n; i += 1) {
				(bool ok, bytes memory v) = address(this).delegatecall(calls[i]);
				if (!ok) assembly { revert(add(v, 32), mload(v)) } // throw first error
				answers[i] = v;
			}
		}
	}

	// convenient multicall
	function setRecords(uint256 token, Text[] calldata texts, Addr[] calldata addrs, bytes[] calldata chash) requireOwner(token) external {
		for (uint256 i; i < texts.length; i += 1) {
			_setText(token, texts[i].key, texts[i].value);
		}
		for (uint256 i; i < addrs.length; i += 1) {
			_setAddr(token, addrs[i].cty, addrs[i].value);
		}
		if (chash.length == 1) {
			_setContenthash(token, chash[0]);
		}
	}

}
