pragma solidity ^0.5.10;


library SafeCast {
    function toUint96(uint256 _a) internal pure returns (uint96) {
        require(_a <= 2 ** 96 - 1, "cast uint96 overflow");
        // assembly { _a := and(_a, sub(exp(2, 96), 1)) }
        return uint96(_a);
    }
}
