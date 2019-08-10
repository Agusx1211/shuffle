pragma solidity ^0.5.10;

import "truffle/Assert.sol";
import "../contracts/utils/DistributedStorage.sol";
import "../contracts/utils/test_utils/TestWallet.sol";


contract TestStorage {
    using DistributedStorage for bytes32;

    function contractSlot(bytes32 _struct) private view returns (address) {
        return address(
            uint256(
                keccak256(
                    abi.encodePacked(
                        byte(0xff),
                        address(this),
                        _struct,
                        keccak256(type(StorageUnit).creationCode)
                    )
                )
            )
        );
    }

    function b(uint256 _int) private pure returns (bytes32) {
        return bytes32(_int);
    }

    function testWrite() external {
        b(1).write(b(2), b(88));
        Assert.equal(b(1).read(b(2)), b(88), "");
    }

    function testReadEmptyKey() external {
        b(1).write(b(1), b(10));
        Assert.equal(b(1).read(b(3)), b(0), "");
    }

    function testReadEmptyStruct() external {
        Assert.equal(b(2).read(b(1)), b(0), "");
    }

    function testUpdateValue() external {
        b(1).write(b(2), b(88));
        Assert.equal(b(1).read(b(2)), b(88), "");
        b(1).write(b(2), b(99));
        Assert.equal(b(1).read(b(2)), b(99), "");
    }

    function testWriteFromExternal() external {
        b(1).write(b(2), b(88));
        address slot = contractSlot(b(1));
        (bool success, ) = new TestWallet().call(slot, 0, abi.encodeWithSelector(
                StorageUnit(slot).write.selector,
                b(2),
                b(100)
            )
        );
        Assert.equal(success, false, "");
        Assert.equal(b(1).read(b(2)), b(88), "");
    }
}
