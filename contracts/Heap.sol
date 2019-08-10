pragma solidity ^0.5.10;

import "./commons/Ownable.sol";
import "./commons/AddressMinHeap.sol";

contract Heap is Ownable {
    using AddressMinHeap for AddressMinHeap.Heap;

    // heap
    AddressMinHeap.Heap private heap;

    // Heap events
    event JoinHeap(address indexed _address, uint256 _balance, uint256 _prevSize);
    event LeaveHeap(address indexed _address, uint256 _balance, uint256 _prevSize);

    uint256 public constant TOP_SIZE = 512;

    constructor() public {
        heap.initialize();
    }

    function topSize() external pure returns (uint256) {
        return TOP_SIZE;
    }

    function addressAt(uint256 _i) external view returns (address addr) {
        (addr, ) = heap.entry(_i);
    }

    function indexOf(address _addr) external view returns (uint256) {
        return heap.index[_addr];
    }

    function entry(uint256 _i) external view returns (address, uint256) {
        return heap.entry(_i);
    }

    function top() external view returns (address, uint256) {
        return heap.top();
    }

    function size() external view returns (uint256) {
        return heap.size();
    }

    function update(address _addr, uint256 _new) external onlyOwner {
        uint256 _size = heap.size();

        // If the heap is empty
        // join the _addr
        if (_size == 0) {
            emit JoinHeap(_addr, _new, 0);
            heap.insert(_addr, _new);
            return;
        }

        // Load top value of the heap
        (, uint256 lastBal) = heap.top();

        // If our target address already is in the heap
        if (heap.has(_addr)) {
            // Update the target address value
            heap.update(_addr, _new);
            // If the new value is 0
            // always pop the heap
            // we updated the heap, so our address should be on top
            if (_new == 0) {
                heap.popTop();
                emit LeaveHeap(_addr, 0, _size);
            }
        } else {
            // IF heap is full or new balance is higher than pop heap
            if (_new != 0 && (_size < TOP_SIZE || lastBal < _new)) {
                // If heap is full pop heap
                if (_size >= TOP_SIZE) {
                    (address _poped, uint256 _balance) = heap.popTop();
                    emit LeaveHeap(_poped, _balance, _size);
                }

                // Insert new value
                heap.insert(_addr, _new);
                emit JoinHeap(_addr, _new, _size);
            }
        }
    }
}
