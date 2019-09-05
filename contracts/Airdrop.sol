pragma solidity ^0.5.10;

import "./commons/ReentrancyGuard.sol";
import "./commons/Ownable.sol";
import "./ShuffleToken.sol";
import "./utils/SigUtils.sol";
import "./utils/IsContract.sol";
import "./utils/SafeCast.sol";
import "./utils/SafeMath.sol";


contract Airdrop is Ownable, ReentrancyGuard {
    using IsContract for address payable;
    using SafeCast for uint256;
    using SafeMath for uint256;

    ShuffleToken public shuffleToken;

    // Management
    uint64 public maxClaimedBy = 0;
    uint256 public refsCut;
    mapping(address => uint256) public customMaxClaimedBy;
    bool public paused;

    event SetMaxClaimedBy(uint256 _max);
    event SetCustomMaxClaimedBy(address _address, uint256 _max);
    event SetSigner(address _signer, bool _active);
    event SetMigrator(address _migrator, bool _active);
    event SetFuse(address _fuse, bool _active);
    event SetPaused(bool _paused);
    event SetRefsCut(uint256 _prev, uint256 _new);
    event Claimed(address _by, address _to, address _signer, uint256 _value, uint256 _claimed);
    event RefClaim(address _ref, uint256 _val);
    event ClaimedOwner(address _owner, uint256 _tokens);

    uint256 public constant MINT_AMOUNT = 1000000 * 10 ** 18;
    uint256 public constant SHUFLE_BY_ETH = 150;
    uint256 public constant MAX_CLAIM_ETH = 10 ether;

    mapping(address => bool) public isSigner;
    mapping(address => bool) public isMigrator;
    mapping(address => bool) public isFuse;

    mapping(address => uint256) public claimed;
    mapping(address => uint256) public numberClaimedBy;

    constructor(ShuffleToken _token) public {
        shuffleToken = _token;
        shuffleToken.init(address(this), MINT_AMOUNT);
        emit SetMaxClaimedBy(maxClaimedBy);
    }

    // ///
    // Management
    // ///

    modifier notPaused() {
        require(!paused, "contract is paused");
        _;
    }

    function setMaxClaimedBy(uint64 _max) external onlyOwner {
        maxClaimedBy = _max;
        emit SetMaxClaimedBy(_max);
    }

    function setSigner(address _signer, bool _active) external onlyOwner {
        isSigner[_signer] = _active;
        emit SetSigner(_signer, _active);
    }

    function setMigrator(address _migrator, bool _active) external onlyOwner {
        isMigrator[_migrator] = _active;
        emit SetMigrator(_migrator, _active);
    }

    function setFuse(address _fuse, bool _active) external onlyOwner {
        isFuse[_fuse] = _active;
        emit SetFuse(_fuse, _active);
    }

    function setSigners(address[] calldata _signers, bool _active) external onlyOwner {
        for (uint256 i = 0; i < _signers.length; i++) {
            address signer = _signers[i];
            isSigner[signer] = _active;
            emit SetSigner(signer, _active);
        }
    }

    function setCustomMaxClaimedBy(address _address, uint256 _max) external onlyOwner {
        customMaxClaimedBy[_address] = _max;
        emit SetCustomMaxClaimedBy(_address, _max);
    }

    function setRefsCut(uint256 _val) external onlyOwner {
        emit SetRefsCut(refsCut, _val);
        refsCut = _val;
    }

    function pause() external {
        require(
            isFuse[msg.sender] ||
            msg.sender == owner ||
            isMigrator[msg.sender] ||
            isSigner[msg.sender],
            "not authorized"
        );

        paused = true;
        emit SetPaused(true);
    }

    function start() external onlyOwner {
        emit SetPaused(false);
        paused = false;
    }

    // ///
    // Airdrop
    // ///

    function _selfBalance() internal view returns (uint256) {
        return shuffleToken.balanceOf(address(this));
    }

    function checkFallback(address _to) private returns (bool success) {
        /* solium-disable-next-line */
        (success, ) = _to.call.value(1)("");
    }

    function claim(
        address _to,
        address _ref,
        uint256 _val,
        bytes calldata _sig
    ) external notPaused nonReentrant {
        // Load values
        uint96 val = _val.toUint96();

        // Validate signature
        bytes32 _hash = keccak256(abi.encodePacked(_to, val));
        address signer = SigUtils.ecrecover2(_hash, _sig);
        require(isSigner[signer], "signature not valid");

        // Prepare claim amount
        uint256 balance = _selfBalance();
        uint256 claimVal = Math.min(
            balance,
            Math.min(
                val,
                MAX_CLAIM_ETH
            ).mult(SHUFLE_BY_ETH)
        );

        // Sanity checks
        assert(claimVal <= SHUFLE_BY_ETH.mult(val));
        assert(claimVal <= MAX_CLAIM_ETH.mult(SHUFLE_BY_ETH));
        assert(claimVal.div(SHUFLE_BY_ETH) <= MAX_CLAIM_ETH);
        assert(
            claimVal.div(SHUFLE_BY_ETH) == _val ||
            claimVal.div(SHUFLE_BY_ETH) == MAX_CLAIM_ETH ||
            claimVal == balance
        );

        // Claim, only once
        require(claimed[_to] == 0, "already claimed");
        claimed[_to] = claimVal;

        // External claim checks
        if (msg.sender != _to) {
            // Validate max external claims
            uint256 _numberClaimedBy = numberClaimedBy[msg.sender].add(1);
            require(_numberClaimedBy <= Math.max(maxClaimedBy, customMaxClaimedBy[msg.sender]), "max claim reached");
            numberClaimedBy[msg.sender] = _numberClaimedBy;
            // Check if _to address can receive ETH
            require(checkFallback(_to), "_to address can't receive tokens");
        }

        // Transfer Shuffle token, paying fee
        shuffleToken.transferWithFee(_to, claimVal);

        // Emit events
        emit Claimed(msg.sender, _to, signer, val, claimVal);

        // Ref links
        if (refsCut != 0) {
            // Only valid for self-claims
            if (msg.sender == _to && _ref != address(0)) {
                // Calc transfer extra
                uint256 extra = claimVal.mult(refsCut).div(10000);
                // Ignore ref fee if Airdrop balance is not enought
                if (_selfBalance() >= extra) {
                    shuffleToken.transferWithFee(_ref, extra);
                    emit RefClaim(_ref, extra);

                    // Sanity checks
                    assert(extra <= MAX_CLAIM_ETH.mult(SHUFLE_BY_ETH));
                    assert(extra <= claimVal);
                    assert(extra == (claimVal * refsCut) / 10000);
                }
            }
        }

        // If contract is empty, perform self destruct
        if (balance == claimVal && _selfBalance() == 0) {
            selfdestruct(address(uint256(owner)));
        }
    }

    // Migration methods

    event Migrated(address _addr, uint256 _balance);
    mapping(address => uint256) public migrated;

    function migrate(address _addr, uint256 _balance, uint256 _require) external notPaused {
        // Check if migrator is a migrator
        require(isMigrator[msg.sender], "only migrator can migrate");

        // Check if expected migrated matches current migrated
        require(migrated[_addr] == _require, "_require prev migrate failed");

        // Save migrated amount
        migrated[_addr] = migrated[_addr].add(_balance);

        // Transfer tokens and emit event
        shuffleToken.transfer(_addr, _balance);
        emit Migrated(_addr, _balance);
    }

    function fund() external payable { }
}
