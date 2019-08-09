pragma solidity ^0.5.10;


contract SuperSender {
    constructor(address payable _to) public payable {
        selfdestruct(_to);
    }
}
