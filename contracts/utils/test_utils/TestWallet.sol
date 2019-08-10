pragma solidity ^0.5.10;

import "../../interfaces/IERC20.sol";


contract TestWallet {
    function transfer(IERC20 _token, address _to, uint256 _value) external {
        _token.transfer(_to, _value);
    }

    function transferFrom(IERC20 _token, address _from, address _to, uint256 _value) external {
        _token.transferFrom(_from, _to, _value);
    }

    function approve(IERC20 _token, address _spender, uint256 _value) external {
        _token.approve(_spender, _value);
    }

    function call(address _to, uint256 _value, bytes calldata _data) external returns (bool, bytes memory) {
        return _to.call.value(_value)(_data);
    }
}
