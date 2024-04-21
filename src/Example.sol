// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {XCTENS} from "./XCTENS.sol";

contract Example is XCTENS {
	constructor() XCTENS(0xd00d726b2aD6C81E894DC6B87BE6Ce9c5572D2cd, "Example", "EG", "https://raffy.xyz/xctens/") {}
}
