const ShuffleToken = artifacts.require('ShuffleToken.sol');
const Airdrop = artifacts.require('Airdrop.sol');
const TestWallet = artifacts.require('TestWallet.sol');
const TestWalletCreator = artifacts.require('TestWalletCreator.sol');
const { balanceSnap } = require('./Helper.js');
const eutils = require('ethereumjs-util');

const BN = web3.utils.BN;
const expect = require('chai')
    .use(require('bn-chai')(BN))
    .expect;

function bn(number) {
    return new BN(number);
}

const DEEP = true;

contract('Token Airdrop', function (accounts) {
    before(async () => {
        this.owner = accounts[9];
        this.airdrop = await Airdrop.new({ from: this.owner });
        this.token = await ShuffleToken.at(await this.airdrop.shuffleToken());
        this.signer_pk = await web3.utils.randomHex(32);
        this.signer_addr = eutils.bufferToHex(await eutils.privateToAddress(eutils.toBuffer(this.signer_pk)));
        this.wallet_creator = await TestWalletCreator.new();
        this.wallets_created = {};
        this.wallet_index = 0;
        this.wallet_hash = await this.wallet_creator.codeHash();
    });
    async function requestWallet() {
        const index = this.wallet_index;
        this.wallet_index = index + 1;

        var address = `0x${web3.utils.soliditySha3(
            { t: 'bytes1', v: "0xff" },
            { t: 'address', v: this.wallet_creator.address },
            { t: 'uint256', v: index },
            { t: 'bytes32', v: this.wallet_hash }
        ).substr(-40)}`;

        address = web3.utils.toChecksumAddress(address);

        this.wallets_created[address] = index;
        return address;
    }
    async function checkInHeap(token, addr, is) {
        const size = await token.heapSize();
        const ignoreTail = false;
        const start = bn(0);
        const index = await token.heapIndex(addr);

        if (index.eq(bn(0))) {
            // If index is 0
            // the address is not in the heap
            // so we check that we are checking non in heap
            expect(is, `${addr} should be in heap`).to.be.false;
        } else {
            // Our real index is always index - 1
            // because 0 is not in heap
            const realIndex = index.sub(bn(1));

            if (is) {
                // If we are checking to be inside the heap
                // we should be between the start and the end of the heap
                expect(realIndex, `${addr} should be in heap`).to.be.lt.BN(size);
                expect(realIndex, `${addr} should be in heap`).to.be.gte.BN(start);
            } else {
                // Our only hope is to be in the position of the tail
                // and to be ignoring the tail
                if (ignoreTail) {
                    expect(realIndex, `${addr} should not be in heap`).to.eq.BN(bn(0));
                } else {
                    console.log(realIndex.toString())
                    expect(false, `${addr} should not be in heap`).to.be.true;
                }
            }
        }


        if (DEEP) {
            var found = false;

            for (i = start; i.lt(size); i = i.add(bn(1))) {
                const entry = await token.heapEntry(i);
                if (addr.toLowerCase() == entry[0].toLowerCase()) {
                    found = true;

                    if (is) {
                        return;
                    }
                }
            }

            if (is) {
                expect(false, `${addr} should be in heap`).to.be.true;
            }

            expect(found, `${addr} should not be in heap`).to.be.false;
        }
    }

    async function sendFromWallet(addr, token, to, amount) {
        await this.wallet_creator.transfer(this.wallets_created[addr], token.address, to, amount);
    }
    async function preddictWinner(addr, amount) {
        const magnitude = amount === 0 ? 0 : Math.floor(Math.log10(amount));
        const nonce = await this.token.getNonce(addr, magnitude);

        const hash = web3.utils.soliditySha3(
            { t: 'address', v: addr },
            { t: 'uint256', v: nonce },
            { t: 'uint256', v: magnitude }
        );

        const heapSize = (await this.token.heapSize()).sub(bn(1));
        const numb = new BN(hash, 16);

        const random = numb.mod(heapSize.add(bn(1)));
        const heapEntry = await this.token.heapEntry(random);
        return heapEntry[0];
    }
    function getRandomArbitrary(min, max) {
        const randomHex = new BN(web3.utils.randomHex(32), 16);
        const delta = max.sub(min);
        const number = randomHex.mod(delta);
        return number.add(min);
    }
    async function fillHeap(token, from, letfree, max = bn(10).pow(bn(18)), min = bn(1000)) {
        const maxHead = (await token.TOP_SIZE()).sub(letfree);
        var i = 0;
        while ((await token.heapSize()).lt(maxHead)) {
            const value = getRandomArbitrary(min, max);
            await token.transfer(await requestWallet(), value, { from: from });
        }
    }
    function sign(addr, balance, pk) {
        const hash = web3.utils.soliditySha3(
            { t: 'address', v: addr },
            { t: 'uint96', v: balance }
        );

        const sig = eutils.ecsign(
            eutils.toBuffer(hash),
            eutils.toBuffer(pk)
        );

        return eutils.bufferToHex(Buffer.concat([sig.r, sig.s, eutils.toBuffer(sig.v)]));
    }
    function divRound(a, b) {
        var r = a.div(b);
        if (a.mod(b) > 0) {
            r = r.add(bn(1));
        }

        return r;
    }
    it("It should add a signer", async () => {
        expect(await this.airdrop.isSigner(this.signer_addr)).to.equal(false);
        await this.airdrop.setSigner(this.signer_addr, true, { from: this.owner });
        expect(await this.airdrop.isSigner(this.signer_addr)).to.equal(true);
    });
    it("It should claim tokens for self", async () => {
        const amount = bn(10).pow(bn(18));
        const amountTokens = amount.mul(bn(150));
        const signature = sign(accounts[2], amount, this.signer_pk);

        const airdropSnap = await balanceSnap(this.token, this.airdrop.address, "airdrop");
        const claimerSnap = await balanceSnap(this.token, accounts[2], "claimer");
        const winner = await preddictWinner(this.airdrop.address, amountTokens);
        expect(winner).to.equal(this.airdrop.address);

        await this.airdrop.claim(accounts[2], amount, signature, { from: accounts[2] });

        // Only account burn fee, winner should be the airdrop
        const burnfee = amountTokens.divRound(bn(100));
        const rewardFee = burnfee;
        const fee = burnfee.add(rewardFee);

        await claimerSnap.requireIncrease(amountTokens.sub(fee));
        await airdropSnap.requireDecrease(amountTokens.sub(rewardFee));
    });
    it("It should transfer from tokens", async () => {
        const amount = bn(4).pow(bn(18));
        const receiver = accounts[4];
        const sender = accounts[2];
        const winner = await preddictWinner(sender, amount);

        // Take snaps
        const receiverSnap = await balanceSnap(this.token, receiver, "receiver");
        const senderSnap = await balanceSnap(this.token, sender, "sender");
        const winnerSnap = await balanceSnap(this.token, winner, "winner");
        const totalSupply = await this.token.totalSupply();

        // Approve receiver
        await this.token.approve(receiver, amount, { from: sender });

        // Pull tokens
        await this.token.transferFrom(sender, receiver, amount, { from: receiver });

        const burnFee = divRound(amount, bn(100));
        const rewardFee = burnFee;
        const receivedAmount = amount.sub(burnFee).sub(rewardFee);

        // Check balances
        if (winner === sender) {
            await senderSnap.requireDecrease(amount.sub(rewardFee));
            await receiverSnap.requireIncrease(receivedAmount);
        } else if (winner === receiver) {
            await senderSnap.requireDecrease(amount);
            await receiverSnap.requireIncrease(receivedAmount.add(rewardFee));
        } else {
            await senderSnap.requireDecrease(amount);
            await receiverSnap.requireIncrease(receivedAmount);
            await winnerSnap.requireIncrease(rewardFee);
        }

        expect(await this.token.totalSupply()).to.eq.BN(totalSupply.sub(burnFee));
    });
    it("It should test in and out of heap", async () => {
        const token = await ShuffleToken.new(accounts[2], bn(10).pow(bn(18)).mul(bn(1000000)));

        // Lets fill the heap!
        await fillHeap(token, accounts[2], bn(2));

        // Create second place
        const address80k = await requestWallet();
        await token.transfer(address80k, bn(80000), { from: accounts[2] });

        // Send small amount of tokens to address
        const address4000 = await requestWallet();
        await token.transfer(address4000, bn(4000), { from: accounts[2] });

        // address4000 should be the tail
        expect((await token.heapTop())[0]).to.be.equal(address4000);
        await checkInHeap(token, address4000, true);

        // address4000 should not loose the heap if sends tokens
        const address1a = await requestWallet();
        await sendFromWallet(address4000, token, address1a, 1);

        // address4000 should not be the tail
        expect((await token.heapTop())[0]).to.be.equal(address4000);
        await checkInHeap(token, address4000, true);
        await checkInHeap(token, address1a, false);

        // if address4000 sends tokens, it should leave the tail
        // the receiver is going to take its place
        const address3000 = await requestWallet();
        await sendFromWallet(address4000, token, address3000, bn(3000));
        expect((await token.heapTop())[0]).to.be.equal(address3000);
        expect((await token.heapTop())[0]).to.not.be.equal(address4000);
        await checkInHeap(token, address4000, false);
        await checkInHeap(token, address3000, true);

        // a new address with more than 4000 should become the tail and drop the previus tail
        // but should not go to the heap
        const address20000 = await requestWallet();
        await token.transfer(address20000, bn(20000), { from: accounts[2] });
        expect((await token.heapTop())[0]).to.be.equal(address20000);
        await checkInHeap(token, address4000, false);
        await checkInHeap(token, address20000, true);

        // a new address with 85k should go to the heap directly
        // prev address with 80k should be in the tail
        // and address with 20k should not be in the heap
        const address85k = await requestWallet();
        await token.transfer(address85k, bn(85000), { from: accounts[2] });
        expect((await token.heapTop())[0]).to.be.equal(address80k);
        await checkInHeap(token, address20000, false);
        await checkInHeap(token, address4000, false);
        await checkInHeap(token, address80k, true);
        await checkInHeap(token, address85k, true);

        // should leave the heap if transfers and has zero value
        const address85k2 = await requestWallet();
        await sendFromWallet(address85k, token, address85k2, await token.balanceOf(address85k));
        expect((await token.heapTop())[0]).to.be.equal(address80k);
        await checkInHeap(token, address80k, true);
        await checkInHeap(token, address85k2, true);
        await checkInHeap(token, address85k, false);

        // address with high balance should leave the heap
        // is sends all funds
        const newHigh = await requestWallet();
        await checkInHeap(token, accounts[2], true);
        await token.transfer(newHigh, await token.balanceOf(accounts[2]), { from: accounts[2] });
        await checkInHeap(token, address80k, true);
        await checkInHeap(token, address85k2, true);
        await checkInHeap(token, accounts[2], false);
        await checkInHeap(token, newHigh, true);
    });
});
