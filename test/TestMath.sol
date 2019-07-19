pragma solidity ^0.5.10;

import "truffle/Assert.sol";
import "../contracts/utils/Math.sol";


contract TestMath {
    using Math for uint256;

    function checkOrderOfMagnitude(uint256 number, uint256 mag) internal {
        Assert.equal(number.orderOfMagnitude(), mag, "");
    }

    function testOrderOfMagnitude() external {
        checkOrderOfMagnitude(0, 0);
        checkOrderOfMagnitude(5, 0);
        checkOrderOfMagnitude(10, 1);
        checkOrderOfMagnitude(15, 1);
        checkOrderOfMagnitude(100, 2);
        checkOrderOfMagnitude(115, 2);
    }

    function testOrderOfMagintudeAuto() external {
        uint256 target = 10;
        uint256 magnitude = 1;
        while (true) {
            if (target * 10 < target) {
                // Overflow
                // finish test
                return;
            }

            checkOrderOfMagnitude(target, magnitude);
            checkOrderOfMagnitude(target + 8, magnitude);
            target *= 10;
            magnitude++;
        }
    }
}
