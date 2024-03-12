/// @author raffy.eth
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

// bases
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Pausable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Multicallable} from "@ensdomains/ens-contracts/contracts/resolvers/Multicallable.sol";

contract XCTENS is ERC721, ERC721Pausable, Ownable, Multicallable {

	function supportsInterface(bytes4 x) public view override(ERC721, Multicallable) returns (bool) {
		return super.supportsInterface(x);
	}

	error InvalidName();
	error Unauthorized();

	event Registered(uint256 indexed token, string name);
	event TextChanged(uint256 indexed token, string indexed key, string value);
	event AddressChanged(uint256 indexed token, uint256 cty, bytes value);
	event ContenthashChanged(uint256 indexed token, bytes value);

	// https://adraffy.github.io/keccak.js/test/demo.html#algo=keccak-256&s=universal&escape=1&encoding=utf8
	uint256 constant EVM_CTY = 0x06e0989d8168c3a954e5b385b12a16a30139850a1596d8de0f6ecfc92bed71a8; // | 0x8000000 = 0

	uint256 public totalSupply;
	string public baseUri;
	mapping(bytes32 => mapping(string => string)) _texts;
	mapping(bytes32 => mapping(uint256 => bytes)) _addrs;
	mapping(bytes32 => bytes) _hashes;
	mapping(uint256 => string) _names;

	constructor(
		address _owner,
		string memory _name,
		string memory _symbol,
		string memory _baseUri
	) ERC721(_name, _symbol) Ownable(_owner) {
		baseUri = _baseUri;
	}
	
	function _baseURI() internal view override returns (string memory) {
		return baseUri;
	}
	function setBaseURI(string memory _baseUri) public onlyOwner {
		baseUri = _baseUri;
	}

	// ERC721Pausable
	function pause() public onlyOwner {
		_pause();
	}
	function unpause() public onlyOwner {
		_unpause();
	}

	// ERC721
	function _update(address to, uint256 token, address auth) internal override(ERC721, ERC721Pausable) returns (address) {
		if (_ownerOf(token) != address(0)) {
			// on trade, auto-enable evm address from owner...
			bytes32 node = _nodeFromParts(to, token);
			if (_addrs[node][EVM_CTY].length == 0) { // ...only if unset
				_addrs[node][EVM_CTY] = abi.encodePacked(to);
			}
		}
		return super._update(to, token, auth);
	}

	// registration
	function _tokenFromLabel(string memory label) internal pure returns (uint256) {
		return uint256(keccak256(abi.encodePacked(label)));
	}
	function _isEVM(uint256 cty) internal pure returns (bool) {
		return cty == 60 || (cty & 0x80000000) != 0;
	}
	function _isValidLabel(string calldata label) internal pure returns (bool) {
		return bytes(label).length >= 4;
	}
	function _nodeFromParts(address owner, uint256 token) internal pure returns (bytes32) {
		return keccak256(abi.encodePacked(token, owner));
	}
	function register(string calldata label, address owner, address evmAddress, string calldata avatar) external {
		if (!_isValidLabel(label)) {
			revert InvalidName();
		}
		uint256 token = _tokenFromLabel(label);
		_safeMint(owner, token); // This will fail if the node is already registered
		_names[token] = label; // reverse name
		bytes32 node = _nodeFromParts(owner, token);
		_addrs[node][EVM_CTY] = abi.encodePacked(evmAddress);
		_texts[node]["avatar"] = avatar;
		totalSupply++;
		emit Registered(token, label);
	}
	
	// registration getters
	function tokenFor(string calldata label) external pure returns (uint256) {
		return _tokenFromLabel(label);
	}
	function available(string calldata label) external view returns (bool) {
		return _ownerOf(_tokenFromLabel(label)) == address(0) && _isValidLabel(label);
	}

	// record setters
	modifier requireOwner(uint256 token) {
		if (_ownerOf(token) != msg.sender) {
			revert Unauthorized();
		}
		_;
	}
	function _unsafeSetAddr(address owner, uint256 token, uint256 cty, bytes memory value) internal {
		_addrs[_nodeFromParts(owner, token)][cty] = value;
		emit AddressChanged(token, cty, value);
	}
	function setEVMAddress(uint256 token, address a) external requireOwner(token)  {
		_unsafeSetAddr(msg.sender, token, EVM_CTY, abi.encodePacked(a));
	}
	function setAddr(uint256 token, uint256 cty, bytes calldata value) external requireOwner(token) {
		_unsafeSetAddr(msg.sender, token, cty, value);
	}
	function setText(uint256 token, string calldata key, string calldata value) external requireOwner(token) {
		_texts[_nodeFromParts(msg.sender, token)][key] = value;
		emit TextChanged(token, key, value);
	}
	function setContenthash(uint256 token, bytes calldata value) external requireOwner(token) {
		_hashes[_nodeFromParts(msg.sender, token)] = value;
		emit ContenthashChanged(token, value);
	}

	// record getters
	function addr(uint256 token, uint256 cty) external view returns (bytes memory v) {
		bytes32 node = _nodeFromParts(_ownerOf(token), token);
		v = _addrs[node][cty];
		if (v.length == 0 && _isEVM(cty)) {
			v = _addrs[node][EVM_CTY];
		}
	}
	function text(uint256 token, string calldata key) external view returns (string memory) {
		return _texts[_nodeFromParts(_ownerOf(token), token)][key];
	}
	function contenthash(uint256 token) external view returns (bytes memory) {
		return _hashes[_nodeFromParts(_ownerOf(token), token)];
	}
	function name(uint256 token) external view returns (string memory) {
		return _names[token];
	}

}
