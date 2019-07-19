pragma solidity ^0.5.10;

import "./TestWallet.sol";
import "../../interfaces/IERC20.sol";
import "../../utils/IsContract.sol";


contract TestWalletCreator {
    using IsContract for address;
    bytes32 public codeHash;

    constructor() public {
        codeHash = keccak256(type(TestWallet).creationCode);
    }

    function addressOf(uint256 _key) public view returns (address) {
        return address(
            uint256(
                keccak256(
                    abi.encodePacked(
                        byte(0xff),
                        address(this),
                        bytes32(_key),
                        codeHash
                    )
                )
            )
        );
    }

    function deploy(uint256 _key) public {
        bytes memory code = type(TestWallet).creationCode;
        /* solium-disable-next-line */
        assembly{ pop(create2(0, add(code, 0x20), mload(code), _key)) }
    }

    function transfer(uint256 _key, IERC20 _token, address _to, uint256 _value) external {
        address wallet = addressOf(_key);
        if (!wallet.isContract()) {
            deploy(_key);
        }

        TestWallet(wallet).transfer(_token, _to, _value);
    }
}
