pragma solidity ^0.5.10;

import "./commons/AddressMinHeap.sol";
import "./commons/Ownable.sol";
import "./utils/DistributedStorage.sol";
import "./utils/SafeMath.sol";
import "./utils/Math.sol";
import "./utils/GasPump.sol";
import "./interfaces/IERC20.sol";


contract ShuffleToken is Ownable, GasPump, IERC20 {
    using AddressMinHeap for AddressMinHeap.Heap;
    using DistributedStorage for bytes32;
    using SafeMath for uint256;

    // Shuffle events
    event Winner(address indexed _addr, uint256 _value);

    // Heap events
    event JoinHeap(address indexed _address, uint256 _balance, uint256 _prevSize);
    event LeaveHeap(address indexed _address, uint256 _balance, uint256 _prevSize);

    // Managment events
    event SetName(string _prev, string _new);
    event SetExtraGas(uint256 _prev, uint256 _new);
    event WhitelistFrom(address _addr, bool _whitelisted);
    event WhitelistTo(address _addr, bool _whitelisted);

    uint256 public totalSupply;

    bytes32 private constant BALANCE_KEY = keccak256("balance");
    bytes32 private constant NONCE_KEY = keccak256("nonce");

    // game
    uint256 public constant FEE = 100;
    uint256 public constant TOP_SIZE = 512;

    // heap
    AddressMinHeap.Heap private heap;

    // metadata
    string public name = "shuffle.monster token V2";
    string public constant symbol = "SHUF";
    uint8 public constant decimals = 18;

    // fee whitelist
    mapping(address => bool) public whitelistFrom;
    mapping(address => bool) public whitelistTo;

    // internal
    uint256 public extraGas;
    bool inited;

    function init(
        address _to,
        uint256 _amount
    ) external {
        require(!inited);
        inited = true;
        heap.initialize();
        extraGas = 15;
        emit SetExtraGas(0, extraGas);
        emit Transfer(address(0), _to, _amount);
        _setBalance(_to, _amount);
        totalSupply = _amount;
    }

    ///
    // Storage access functions
    ///

    function _toKey(address a) internal pure returns (bytes32) {
        return bytes32(uint256(a));
    }

    function _balanceOf(address _addr) internal view returns (uint256) {
        return uint256(_toKey(_addr).read(BALANCE_KEY));
    }

    function _allowance(address _addr, address _spender) internal view returns (uint256) {
        return uint256(_toKey(_addr).read(keccak256(abi.encodePacked("allowance", _spender))));
    }

    function _nonce(address _addr, uint256 _cat) internal view returns (uint256) {
        return uint256(_toKey(_addr).read(keccak256(abi.encodePacked("nonce", _cat))));
    }

    function _setAllowance(address _addr, address _spender, uint256 _value) internal {
        _toKey(_addr).write(keccak256(abi.encodePacked("allowance", _spender)), bytes32(_value));
    }

    function _setNonce(address _addr, uint256 _cat, uint256 _value) internal {
        _toKey(_addr).write(keccak256(abi.encodePacked("nonce", _cat)), bytes32(_value));
    }

    function _setBalance(address _addr, uint256 _balance) internal {
        _toKey(_addr).write(BALANCE_KEY, bytes32(_balance));
        _computeHeap(_addr, _balance);
    }

    function getNonce(address _addr, uint256 _cat) external view returns (uint256) {
        return _nonce(_addr, _cat);
    }

    ///
    // Internal methods
    ///

    function _isWhitelisted(address _from, address _to) internal view returns (bool) {
        return whitelistFrom[_from]||whitelistTo[_to];
    }

    function _random(address _s1, uint256 _s2, uint256 _s3, uint256 _max) internal pure returns (uint256) {
        uint256 rand = uint256(keccak256(abi.encodePacked(_s1, _s2, _s3)));
        return rand % (_max + 1);
    }

    function _pickWinner(address _from, uint256 _value) internal returns (address winner) {
        // Get order of magnitude of the tx
        uint256 magnitude = Math.orderOfMagnitude(_value);
        // Pull nonce for a given order of magnitude
        uint256 nonce = _nonce(_from, magnitude);
        _setNonce(_from, magnitude, nonce + 1);
        // pick entry from heap
        (winner,) = heap.entry(_random(_from, nonce, magnitude, heap.size() - 1));
    }

    function _transferFrom(address _operator, address _from, address _to, uint256 _value, bool _skipWhitelist) internal {
        if (_value == 0) {
            emit Transfer(_from, _to, 0);
            return;
        }

        uint256 balanceFrom = _balanceOf(_from);
        require(balanceFrom >= _value, "balance not enough");

        if (_from != _operator) {
            uint256 allowanceFrom = _allowance(_from, _operator);
            if (allowanceFrom != uint(-1)) {
                require(allowanceFrom >= _value, "allowance not enough");
                _setAllowance(_from, _operator, allowanceFrom.sub(_value));
            }
        }

        uint256 receive = _value;
        _setBalance(_from, balanceFrom.sub(_value));

        if (_skipWhitelist || !_isWhitelisted(_from, _to)) {
            uint256 burn = _value.divRound(FEE);
            uint256 shuf = _value == 1 ? 0 : burn;
            receive = receive.sub(burn.add(shuf));

            // Burn tokens
            totalSupply = totalSupply.sub(burn);
            emit Transfer(_from, address(0), burn);

            // Shuffle tokens
            // Pick winner pseudo-randomly
            address winner = _pickWinner(_from, _value);
            // Transfer balance to winner
            _setBalance(winner, _balanceOf(winner).add(shuf));
            emit Winner(winner, shuf);
            emit Transfer(_from, winner, shuf);
        }

        // Transfer tokens
        _setBalance(_to, _balanceOf(_to).add(receive));
        emit Transfer(_from, _to, receive);
    }

    function _computeHeap(address _addr, uint256 _new) internal {
        uint256 size = heap.size();
        if (size == 0) {
            emit JoinHeap(_addr, _new, 0);
            heap.insert(_addr, _new);
            return;
        }

        (, uint256 lastBal) = heap.top();

        if (heap.has(_addr)) {
            heap.update(_addr, _new);
            if (_new == 0) {
                heap.popTop();
                emit LeaveHeap(_addr, 0, size);
            }
        } else {
            // IF heap is full or new bal is better than pop heap
            if (_new != 0 && (size < TOP_SIZE || lastBal < _new)) {
                // If heap is full pop heap
                if (size >= TOP_SIZE) {
                    (address _poped, uint256 _balance) = heap.popTop();
                    emit LeaveHeap(_poped, _balance, size);
                }

                // Insert new value
                heap.insert(_addr, _new);
                emit JoinHeap(_addr, _new, size);
            }
        }
    }

    ///
    // Managment
    ///

    function setWhitelistedTo(address _addr, bool _whitelisted) external onlyOwner {
        emit WhitelistTo(_addr, _whitelisted);
        whitelistTo[_addr] = _whitelisted;
    }

    function setWhitelistedFrom(address _addr, bool _whitelisted) external onlyOwner {
        emit WhitelistFrom(_addr, _whitelisted);
        whitelistFrom[_addr] = _whitelisted;
    }

    function setName(string calldata _name) external onlyOwner {
        emit SetName(name, _name);
        name = _name;
    }

    function setExtraGas(uint256 _gas) external onlyOwner {
        emit SetExtraGas(extraGas, _gas);
        extraGas = _gas;
    }

    /////
    // Heap methods
    /////

    function heapSize() external view returns (uint256) {
        return heap.size();
    }

    function heapEntry(uint256 _i) external view returns (address, uint256) {
        return heap.entry(_i);
    }

    function heapTop() external view returns (address, uint256) {
        return heap.top();
    }

    function heapIndex(address _addr) external view returns (uint256) {
        return heap.index[_addr];
    }

    /////
    // ERC20
    /////

    function balanceOf(address _addr) external view returns (uint256) {
        return _balanceOf(_addr);
    }

    function allowance(address _addr, address _spender) external view returns (uint256) {
        return _allowance(_addr, _spender);
    }

    function approve(address _spender, uint256 _value) external returns (bool) {
        emit Approval(msg.sender, _spender, _value);
        _setAllowance(msg.sender, _spender, _value);
        return true;
    }

    function transfer(address _to, uint256 _value) external requestGas(extraGas) returns (bool) {
        _transferFrom(msg.sender, msg.sender, _to, _value, false);
        return true;
    }

    function transferWithFee(address _to, uint256 _value) external requestGas(extraGas) returns (bool) {
        _transferFrom(msg.sender, msg.sender, _to, _value, true);
        return true;
    }

    function transferFrom(address _from, address _to, uint256 _value) external requestGas(extraGas) returns (bool) {
        _transferFrom(msg.sender, _from, _to, _value, false);
        return true;
    }
}
