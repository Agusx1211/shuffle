// solium-disable security/no-low-level-calls
pragma solidity ^0.5.10;

import "../contracts/commons/AddressMinHeap.sol";
import "truffle/Assert.sol";


contract TestHeap {
    using AddressMinHeap for AddressMinHeap.Heap;

    uint256 private ind;
    mapping(uint256 => AddressMinHeap.Heap) private heaps;

    function testSingleElementInv() external {
        AddressMinHeap.Heap storage heap = getHeap();
        heap.insert(address(2), 50);
        expectTop(heap, address(2), 50);
        validate(heap);

        // Update element
        heap.update(address(2), 300);
        expectTop(heap, address(2), 300);
        validate(heap);

        // Pop
        heap.popTop();
        expectTop(heap, address(0), 0);
        validate(heap);
    }

    function testTwoElementsInv() external {
        AddressMinHeap.Heap storage heap = getHeap();
        heap.insert(address(1), 100);
        heap.insert(address(2), 200);
        expectTop(heap, address(1), 100);
        validate(heap);

        // Update elements
        heap.update(address(1), 50);
        expectTop(heap, address(1), 50);
        validate(heap);

        heap.update(address(2), 25);
        expectTop(heap, address(2), 25);
        validate(heap);

        heap.update(address(2), 90);
        expectTop(heap, address(1), 50);
        validate(heap);

        // Pop elements
        heap.popTop();
        expectTop(heap, address(2), 90);
        validate(heap);

        heap.popTop();
        expectTop(heap, address(0), 0);
        validate(heap);
    }

    function testTwoElementsInsertRevInv() external {
        AddressMinHeap.Heap storage heap = getHeap();
        heap.insert(address(2), 200);
        heap.insert(address(1), 100);
        expectTop(heap, address(1), 100);
        validate(heap);
    }

    function testThreeElementsInsertInv() external {
        AddressMinHeap.Heap storage heap = getHeap();
        heap.insert(address(1), 100);
        heap.insert(address(2), 300);
        heap.insert(address(3), 200);
        expectTop(heap, address(1), 100);
        validate(heap);

        // Update elements
        heap.update(address(2), 150);
        expectTop(heap, address(1), 100);
        validate(heap);

        heap.update(address(3), 50);
        expectTop(heap, address(3), 50);
        validate(heap);

        heap.update(address(1), 400);
        expectTop(heap, address(3), 50);
        validate(heap);

        heap.update(address(3), 350);
        expectTop(heap, address(2), 150);
        validate(heap);

        // Pop elements
        heap.popTop();
        expectTop(heap, address(3), 350);
        validate(heap);

        heap.popTop();
        expectTop(heap, address(1), 400);
        validate(heap);

        heap.popTop();
        expectTop(heap, address(0), 0);
        validate(heap);
    }

    function testFourElementsInv() external {
        AddressMinHeap.Heap storage heap = getHeap();
        heap.insert(address(1), 100);
        heap.insert(address(2), 300);
        heap.insert(address(3), 2);
        heap.insert(address(4), 50);
        expectTop(heap, address(3), 2);
        validate(heap);

        // Update elements
        heap.update(address(1), 25);
        expectTop(heap, address(3), 2);
        validate(heap);

        heap.update(address(4), 1);
        expectTop(heap, address(4), 1);
        validate(heap);

        heap.update(address(3), 90);
        expectTop(heap, address(4), 1);
        validate(heap);

        heap.update(address(4), 100);
        expectTop(heap, address(1), 25);
        validate(heap);

        // Pop elements
        heap.popTop();
        expectTop(heap, address(3), 90);
        validate(heap);

        heap.popTop();
        expectTop(heap, address(4), 100);
        validate(heap);

        heap.popTop();
        expectTop(heap, address(2), 300);
        validate(heap);

        heap.popTop();
        expectTop(heap, address(0), 0);
        validate(heap);
    }

    function testFiveElementsInv() external {
        AddressMinHeap.Heap storage heap = getHeap();
        heap.insert(address(1), 100);
        heap.insert(address(2), 300);
        heap.insert(address(3), 200);
        heap.insert(address(4), 50);
        heap.insert(address(5), 400);
        expectTop(heap, address(4), 50);
        validate(heap);

        // Update elements
        heap.update(address(3), 75);
        expectTop(heap, address(4), 50);
        validate(heap);

        heap.update(address(5), 25);
        expectTop(heap, address(5), 25);
        validate(heap);

        heap.update(address(4), 250);
        expectTop(heap, address(5), 25);
        validate(heap);

        heap.update(address(5), 35);
        expectTop(heap, address(5), 35);
        validate(heap);

        // Pop elements
        heap.popTop();
        expectTop(heap, address(3), 75);
        validate(heap);

        heap.popTop();
        expectTop(heap, address(1), 100);
        validate(heap);

        heap.popTop();
        expectTop(heap, address(4), 250);
        validate(heap);

        heap.popTop();
        expectTop(heap, address(2), 300);
        validate(heap);

        heap.popTop();
        expectTop(heap, address(0), 0);
        validate(heap);
    }

    function testSixElementsInv() external {
        AddressMinHeap.Heap storage heap = getHeap();
        heap.insert(address(1), 100);
        heap.insert(address(2), 300);
        heap.insert(address(3), 200);
        heap.insert(address(4), 50);
        heap.insert(address(5), 400);
        heap.insert(address(6), 900);
        expectTop(heap, address(4), 50);
        validate(heap);

        // Update elements
        heap.update(address(6), 75);
        expectTop(heap, address(4), 50);
        validate(heap);

        heap.update(address(1), 25);
        expectTop(heap, address(1), 25);
        validate(heap);

        heap.update(address(6), 450);
        expectTop(heap, address(1), 25);
        validate(heap);

        heap.update(address(1), 1000);
        expectTop(heap, address(4), 50);
        validate(heap);

        // Pop elements
        heap.popTop();
        Assert.isFalse(heap.has(address(4)), "heap should not have address");
        expectTop(heap, address(3), 200);
        validate(heap);

        heap.popTop();
        Assert.isFalse(heap.has(address(3)), "heap should not have address");
        expectTop(heap, address(2), 300);
        validate(heap);

        heap.popTop();
        Assert.isFalse(heap.has(address(2)), "heap should not have address");
        expectTop(heap, address(5), 400);
        validate(heap);

        heap.popTop();
        Assert.isFalse(heap.has(address(5)), "heap should not have address");
        expectTop(heap, address(6), 450);
        validate(heap);

        heap.popTop();
        Assert.isFalse(heap.has(address(6)), "heap should not have address");
        expectTop(heap, address(1), 1000);
        validate(heap);

        heap.popTop();
        Assert.isFalse(heap.has(address(1)), "heap should not have address");
        expectTop(heap, address(0), 0);
        validate(heap);
    }

    function testUpdateSameValue() external {
        AddressMinHeap.Heap storage heap = getHeap();
        heap.insert(address(2), 200);
        heap.insert(address(1), 100);
        heap.update(address(1), 100);
        expectTop(heap, address(1), 100);
        validate(heap);
    }

    // Externally tested

    function externalAlreadyInitialized() external {
        AddressMinHeap.Heap storage heap = getHeap();
        heap.initialize();
    }

    function testAlreadyInitialized() external {
        (bool success, ) = address(this).call(abi.encodeWithSelector(
                this.externalAlreadyInitialized.selector
            )
        );

        Assert.isFalse(success, "double initialize should revert");
    }

    function externalPopEmpty() external {
        AddressMinHeap.Heap storage heap = getHeap();
        heap.popTop();
    }

    function testPopEmpty() external {
        (bool success, ) = address(this).call(abi.encodeWithSelector(
                this.externalPopEmpty.selector
            )
        );

        Assert.isFalse(success, "pop empty heap should fail");
    }

    function externalDuplicatedInsert() external {
        AddressMinHeap.Heap storage heap = getHeap();
        heap.insert(address(1), 2);
        heap.insert(address(1), 3);
    }

    function testDuplicatedInsert() external {
        (bool success, ) = address(this).call(abi.encodeWithSelector(
                this.externalDuplicatedInsert.selector
            )
        );

        Assert.isFalse(success, "duplicated insert should fail");
    }

    function externalUpdateNonExistent() external {
        AddressMinHeap.Heap storage heap = getHeap();
        heap.update(address(1), 2);
    }

    function testUpdateNonExistent() external {
        (bool success, ) = address(this).call(abi.encodeWithSelector(
                this.externalUpdateNonExistent.selector
            )
        );

        Assert.isFalse(success, "update non existent should fail");
    }

    function validate(AddressMinHeap.Heap storage _heap) private {
        uint256 length = _heap.entries.length - 1;
        Assert.equal(length, _heap.size(), "size should equal length - 1");
        bool uneven = false;
        for (uint256 i = 1; i <= length; i++) {
            uint256 val = _heap.entries[i];

            // Test decode and encode
            (address daddr, uint256 dvalue) = AddressMinHeap.decode(val);
            (uint256 eentry) = AddressMinHeap.encode(daddr, dvalue);
            Assert.equal(val, eentry, "re-encoded entry should equal original entry");
            Assert.equal(daddr, AddressMinHeap.decodeAddress(val), "decoded address should equal addr");
            Assert.isTrue(_heap.has(daddr), "heap should have addr");

            if (i != 1) {
                // has parent
                uint256 parent = _heap.entries[i / 2];
                Assert.isAtMost(val, parent, "child should be lower or equal to parent");
            }

            if (i * 2 < length) {
                // has child
                uint256 child1 = _heap.entries[i * 2];
                Assert.isAtLeast(val, child1, "should be greater or equal to child 1");

                if (i * 2 + 1 < length) {
                    uint256 child2 = _heap.entries[i * 2 + 1];
                    Assert.isAtLeast(val, child2, "should be greater or equal to child 2");
                } else {
                    Assert.isFalse(uneven, "can't be uneven twice");
                    uneven = true;
                }
            }
        }
    }

    function expectTop(AddressMinHeap.Heap storage _heap, address _addr, uint256 _val) private {
        (address raddr, uint256 rval) = _heap.top();
        Assert.equal(_val, rval, "top value should be equal");
        Assert.equal(_addr, raddr, "top address should be equal");
    }

    function getHeap() private returns (AddressMinHeap.Heap storage) {
        AddressMinHeap.Heap storage heap = heaps[ind++];
        heap.initialize();
        return heap;
    }
}
