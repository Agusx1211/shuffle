pragma solidity ^0.5.10;

import "../../interfaces/IERC20.sol";


contract TestWallet {
    function transfer(IERC20 _token, address _to, uint256 _value) external {
        _token.transfer(_to, _value);
    }
}
