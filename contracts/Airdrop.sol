pragma solidity ^0.5.10;

import "./commons/Ownable.sol";
import "./ShuffleToken.sol";
import "./utils/SigUtils.sol";
import "./utils/IsContract.sol";


contract Airdrop is Ownable {
    using IsContract for address payable;

    ShuffleToken public shuffleToken;

    // Managment
    uint64 public maxClaimedBy = 100;

    event SetMaxClaimedBy(uint256 _max);
    event SetSigner(address _signer, bool _active);
    event Claimed(address _by, address _to, address _signer, uint256 _value, uint256 _claimed);
    event ClaimedOwner(address _owner, uint256 _tokens);

    uint256 public constant MINT_AMOUNT = 1010101010101010101010101;
    uint256 public constant CREATOR_AMOUNT = (MINT_AMOUNT * 6) / 100;
    uint256 public constant SHUFLE_BY_ETH = 150;
    uint256 public constant MAX_CLAIM_ETH = 10 ether;

    mapping(address => bool) public isSigner;

    mapping(address => uint256) public claimed;
    mapping(address => uint256) public numberClaimedBy;
    bool public creatorClaimed;

    constructor() public {
        shuffleToken = new ShuffleToken(address(this), MINT_AMOUNT);
        emit SetMaxClaimedBy(maxClaimedBy);
        shuffleToken.setOwner(msg.sender);
    }

    // ///
    // Managment
    // ///

    function setMaxClaimedBy(uint64 _max) external onlyOwner {
        maxClaimedBy = _max;
        emit SetMaxClaimedBy(_max);
    }

    function setSigner(address _signer, bool _active) external onlyOwner {
        isSigner[_signer] = _active;
        emit SetSigner(_signer, _active);
    }

    function setSigners(address[] calldata _signers, bool _active) external onlyOwner {
        for (uint256 i = 0; i < _signers.length; i++) {
            address signer = _signers[i];
            isSigner[signer] = _active;
            emit SetSigner(signer, _active);
        }
    }

    // ///
    // View
    // ///

    mapping(address => bool) private cvf;

    event CallCVF(address _from, address _to);

    function supportsFallback(address _to) external returns (bool) {
        emit CallCVF(msg.sender, _to);
        require(!cvf[msg.sender], "cfv");
        cvf[msg.sender] = true;
        return checkFallback(_to);
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

    function pullOwnerTokens() external onlyOwner {
        require(!creatorClaimed, "creator already pulled");
        creatorClaimed = true;
        uint256 tokens = Math.min(CREATOR_AMOUNT, _selfBalance());
        shuffleToken.transfer(msg.sender, tokens);
        emit ClaimedOwner(msg.sender, tokens);
    }

    function claim(
        address _to,
        uint256 _val,
        bytes calldata _sig
    ) external {
        bytes32 _hash = keccak256(abi.encodePacked(_to, uint96(_val)));
        address signer = SigUtils.ecrecover2(_hash, _sig);

        require(isSigner[signer], "signature not valid");

        uint256 balance = _selfBalance();
        uint256 claimVal = Math.min(
            balance,
            Math.min(
                _val,
                MAX_CLAIM_ETH
            ) * SHUFLE_BY_ETH
        );

        require(claimed[_to] == 0, "already claimed");
        claimed[_to] = claimVal;

        if (msg.sender != _to) {
            uint256 _numberClaimedBy = numberClaimedBy[msg.sender];
            require(_numberClaimedBy <= maxClaimedBy, "max claim reached");
            numberClaimedBy[msg.sender] = _numberClaimedBy + 1;
            require(checkFallback(_to), "_to address can't receive tokens");
        }

        shuffleToken.transfer(_to, claimVal);

        emit Claimed(msg.sender, _to, signer, _val, claimVal);

        if (balance == claimVal && _selfBalance() == 0) {
            selfdestruct(address(uint256(owner)));
        }
    }
}
