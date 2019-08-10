const ShuffleToken = artifacts.require('ShuffleToken.sol');
const Airdrop = artifacts.require('Airdrop.sol');
const TestWallet = artifacts.require('TestWallet.sol');
const TestWalletCreator = artifacts.require('TestWalletCreator.sol');
const SuperSender = artifacts.require('SuperSender.sol');
const { balanceSnap, totalSupplySnap, tryCatchRevert } = require('./Helper.js');
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
        this.prev_token = await ShuffleToken.new();
        this.prev_airdrop = await Airdrop.new(prev_token.address, "0x0000000000000000000000000000000000000000", { from: this.owner });
        this.token = await ShuffleToken.new({ from: this.owner });
        this.reparter = await Airdrop.new(this.token.address, prev_airdrop.address, { from: this.owner });
        this.signer_pk = await web3.utils.randomHex(32);
        this.signer_addr = eutils.bufferToHex(await eutils.privateToAddress(eutils.toBuffer(this.signer_pk)));
        this.wallet_creator = await TestWalletCreator.new();
        this.wallets_created = {};
        this.wallet_index = 0;
        this.wallet_hash = await this.wallet_creator.codeHash();
        await this.reparter.fund({ value: 1000 });
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
    async function shufFeeSnap(from, to, value) {
        const fromSnap = await balanceSnap(this.token, from, "from");
        const toSnap = await balanceSnap(this.token, to, "to");
        const winner = await preddictWinner(from, value);
        const winnerSnap = await balanceSnap(this.token, winner, "winner");
        const fee = value.divRound(bn(100));
        const supplySnap = await totalSupplySnap(this.token);
        return {
            validate: async function () {
                await supplySnap.requireDecrease(fee);
                if (winner.toLowerCase() == from.toLowerCase()) {
                    await fromSnap.requireDecrease(value.sub(fee));
                    await toSnap.requireIncrease(value.sub(fee.mul(bn(2))));
                } else if (winner.toLowerCase() == to.toLowerCase()) {
                    await fromSnap.requireDecrease(value.sub(fee.mul(bn(2))));
                    await toSnap.requireIncrease(value.sub(fee));
                } else {
                    await toSnap.requireIncrease(value.sub(fee.mul(bn(2))));
                    await fromSnap.requireDecrease(value);
                    await winnerSnap.requireIncrease(fee);
                }
            }
        }
    }
    async function getFundedWallet(amount) {
        // Calculate amounts
        const reqAmount = bn(amount);
        const claimAmount = reqAmount.add(amount.div(bn(48)));
        const claimEth = claimAmount.divRound(bn(150));
        const realClaim = claimEth.mul(bn(150));

        const wallet = await requestWallet();
        const signature = sign(wallet, claimEth, this.signer_pk);

        const feeSnap = await shufFeeSnap(this.reparter.address, wallet, realClaim);

        // Perform claim
        await this.reparter.claim(wallet, claimEth, signature);

        await feeSnap.validate();

        // Return wallet
        return wallet;
    }
    async function sendFromWallet(addr, token, to, amount) {
        await this.wallet_creator.transfer(this.wallets_created[addr], token.address, to, amount);
    }
    async function approveFromWallet(addr, token, spender, amount) {
        await this.wallet_creator.approve(this.wallets_created[addr], token.address, spender, amount);
    }
    async function pullFromWallet(addr, token, from, to, amount) {
        await this.wallet_creator.transferFrom(this.wallets_created[addr], token.address, from, to, amount);
    }
    async function preddictWinner(addr, amount) {
        const magnitude = amount === bn(0) ? bn(0) : Math.floor(Math.log10(amount));
        const nonce = await this.token.getNonce(addr, magnitude);
        const hash = web3.utils.soliditySha3(
            { t: 'address', v: addr },
            { t: 'uint256', v: nonce },
            { t: 'uint256', v: magnitude }
        );

        const heapSize = (await this.token.heapSize()).sub(bn(1));
        const numb = new BN(hash.toString().substr(2), 16);

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
        const maxHead = (await token.topSize()).sub(letfree);
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
        expect(await this.reparter.isSigner(this.signer_addr)).to.equal(false);
        await this.reparter.setSigner(this.signer_addr, true, { from: this.owner });
        expect(await this.reparter.isSigner(this.signer_addr)).to.equal(true);
    });
    it("It should claim tokens for self", async () => {
        const amount = bn(10).pow(bn(18));
        const amountTokens = amount.mul(bn(150));
        const signature = sign(accounts[2], amount, this.signer_pk);

        const reparterSnap = await balanceSnap(this.token, this.reparter.address, "reparter");
        const claimerSnap = await balanceSnap(this.token, accounts[2], "claimer");
        const winner = await preddictWinner(this.reparter.address, amountTokens);
        expect(winner).to.equal(this.reparter.address);

        await this.reparter.claim(accounts[2], amount, signature, { from: accounts[2] });

        // Only account burn fee, winner should be the reparter
        const burnfee = amountTokens.divRound(bn(100));
        const rewardFee = burnfee;
        const fee = burnfee.add(rewardFee);

        await claimerSnap.requireIncrease(amountTokens.sub(fee));
        await reparterSnap.requireDecrease(amountTokens.sub(rewardFee));
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
        const token = await ShuffleToken.new();
        await token.init(accounts[2], bn(10).pow(bn(18)).mul(bn(1000000)));

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
    it("It should fail to claim large over uint96 amount", async () => {
        const amount = bn(10).pow(bn(18));
        const amountTokens = amount.mul(bn(150));
        const signature = sign(accounts[9], amount, this.signer_pk);
        const tryamount = amount.add(bn(2).pow(bn(128)));

        const claimerSnap = await balanceSnap(this.token, accounts[9], "claimer");
        const reparterSnap = await balanceSnap(this.token, this.reparter.address, "reparter");

        await tryCatchRevert(this.reparter.claim(accounts[9], tryamount, signature, { from: accounts[2] }), "cast uint96 overflow");

        await claimerSnap.requireConstant();
        await reparterSnap.requireConstant();
    });
    it("Should update balances accordingly with whitelist", async () => {
        const amount = bn(10).pow(bn(18));
        const amountTokens = amount.mul(bn(150));
        const signature = sign(accounts[8], amount, this.signer_pk);

        await this.reparter.claim(accounts[8], amount, signature, { from: accounts[9] });

        const senderSnap = await balanceSnap(this.token, accounts[8], "sender");
        const receiverSnap = await balanceSnap(this.token, accounts[9], "receiver");

        await this.token.transfer(accounts[9], 100, { from: accounts[8] });

        await senderSnap.requireDecrease(bn(100));
        await receiverSnap.requireIncrease(bn(98));
    });
    describe("ERC20 token tests", async () => {
        it("Should transfer 0 tokens with 0 balance", async () => {
            // With 0 balance
            const wallet = await requestWallet();
            const walletSnap = await balanceSnap(this.token, wallet, "wallet");
            const receivSnap = await balanceSnap(this.token, accounts[5], "receiver snap");
            const supplySnap = await totalSupplySnap(this.token);
            await sendFromWallet(wallet, this.token, accounts[5], 0);
            await walletSnap.requireConstant();
            await receivSnap.requireConstant();
            await supplySnap.requireConstant();
        });
        it("Should transfer 0 tokens with balance", async () => {
            // With balance
            const wallet = await getFundedWallet(bn(11).mul(bn(10).pow(bn(18))));
            const walletSnap = await balanceSnap(this.token, wallet, "wallet");
            const receivSnap = await balanceSnap(this.token, accounts[5], "receiver snap");
            const supplySnap = await totalSupplySnap(this.token);
            await sendFromWallet(wallet, this.token, accounts[5], 0);
            await walletSnap.requireConstant();
            await receivSnap.requireConstant();
            await supplySnap.requireConstant();
        });
        it("Should transfer 200 tokens using transfer and pay fees", async () => {
            const amount = bn(200).mul(bn(10).pow(bn(18)));
            const wallet = await getFundedWallet(amount);
            const receiv = await requestWallet();
            const feeSnap = await shufFeeSnap(wallet, receiv, amount);

            await sendFromWallet(wallet, this.token, receiv, amount);
            await feeSnap.validate();
        });
        it("Should transfer 1200 tokens using transferFrom and pay fees", async () => {
            const amount = bn(1200).mul(bn(10).pow(bn(18)));

            // Create wallets
            const wallet = await getFundedWallet(amount);
            const winner = await preddictWinner(wallet, amount);
            const receiv = await requestWallet();
            const puller = await requestWallet();

            // Take snaps
            const feeSnap = await shufFeeSnap(wallet, receiv, amount);
            const pullerSnap = await balanceSnap(this.token, puller, "puller");

            // Approve transferFrom
            expect(await this.token.allowance(wallet, puller)).to.eq.BN(bn(0));
            await approveFromWallet(wallet, this.token, puller, amount);

            // Validate approve
            expect(await this.token.allowance(wallet, puller)).to.eq.BN(amount);

            // Pull tokens
            await pullFromWallet(puller, this.token, wallet, receiv, amount);

            // Validate amounts
            await feeSnap.validate();
            await pullerSnap.requireConstant();

            // Validate that allowance decreased
            expect(await this.token.allowance(wallet, puller)).to.eq.BN(bn(0));
        });
        it("Should transfer 100 tokens using transferFrom, leaving the rest and paying fees", async () => {
            const amount = bn(1200).mul(bn(10).pow(bn(18)));
            const transfer = bn(100).mul(bn(10).pow(bn(18)));

            // Create wallets
            const wallet = await getFundedWallet(amount);
            const winner = await preddictWinner(wallet, transfer);
            const receiv = await requestWallet();
            const puller = await requestWallet();

            // Take snaps
            const feeSnap = await shufFeeSnap(wallet, receiv, transfer);
            const pullerSnap = await balanceSnap(this.token, puller, "puller");

            // Approve transferFrom
            expect(await this.token.allowance(wallet, puller)).to.eq.BN(bn(0));
            await approveFromWallet(wallet, this.token, puller, amount);

            // Validate approve
            expect(await this.token.allowance(wallet, puller)).to.eq.BN(amount);

            // Pull tokens
            await pullFromWallet(puller, this.token, wallet, receiv, transfer);

            // Validate amounts
            await feeSnap.validate();
            await pullerSnap.requireConstant();

            // Validate that allowance decreased
            expect(await this.token.allowance(wallet, puller)).to.eq.BN(amount.sub(transfer));
        });
        it("Should fail transfer 1000 tokens using transferFrom if balance not enough", async () => {
            const amount = bn(850).mul(bn(10).pow(bn(18)));
            const transfer = bn(1000).mul(bn(10).pow(bn(18)));

            // Create wallets
            const wallet = await getFundedWallet(amount);
            const winner = await preddictWinner(wallet, transfer);
            const receiv = await requestWallet();
            const puller = await requestWallet();

            // Take snaps
            const winnerSnap = await balanceSnap(this.token, winner, "winner");
            const walletSnap = await balanceSnap(this.token, wallet, "wallet");
            const receivSnap = await balanceSnap(this.token, receiv, "receiver snap");
            const pullerSnap = await balanceSnap(this.token, puller, "puller");
            const supplySnap = await totalSupplySnap(this.token);

            // Validate approve
            expect(await this.token.allowance(wallet, puller)).to.eq.BN(bn(0));

            // Pull tokens
            await tryCatchRevert(pullFromWallet(puller, this.token, wallet, receiv, transfer), "balance not enough");

            // Validate amounts
            await walletSnap.requireConstant();
            await receivSnap.requireConstant();
            await supplySnap.requireConstant();
            await winnerSnap.requireConstant();
            await pullerSnap.requireConstant();

            // Validate that allowance remained constant
            expect(await this.token.allowance(wallet, puller)).to.eq.BN(bn(0));
        });
        it("Should fail transfer 1000 tokens using transferFrom if balance is 0", async () => {
            const transfer = bn(1000).mul(bn(10).pow(bn(18)));

            // Create wallets
            const wallet = await requestWallet();
            const winner = await preddictWinner(wallet, transfer);
            const receiv = await requestWallet();
            const puller = await requestWallet();

            // Take snaps
            const winnerSnap = await balanceSnap(this.token, winner, "winner");
            const walletSnap = await balanceSnap(this.token, wallet, "wallet");
            const receivSnap = await balanceSnap(this.token, receiv, "receiver snap");
            const pullerSnap = await balanceSnap(this.token, puller, "puller");
            const supplySnap = await totalSupplySnap(this.token);

            // Validate approve
            expect(await this.token.allowance(wallet, puller)).to.eq.BN(bn(0));

            // Pull tokens
            await tryCatchRevert(pullFromWallet(puller, this.token, wallet, receiv, transfer), "balance not enough");

            // Validate amounts
            await walletSnap.requireConstant();
            await receivSnap.requireConstant();
            await supplySnap.requireConstant();
            await winnerSnap.requireConstant();
            await pullerSnap.requireConstant();
        });
        it("Should fail transfer 1000 tokens using transfer if balance is 0", async () => {
            const transfer = bn(1000).mul(bn(10).pow(bn(18)));

            // Create wallets
            const wallet = await requestWallet();
            const winner = await preddictWinner(wallet, transfer);
            const receiv = await requestWallet();
            const puller = await requestWallet();

            // Take snaps
            const winnerSnap = await balanceSnap(this.token, winner, "winner");
            const walletSnap = await balanceSnap(this.token, wallet, "wallet");
            const receivSnap = await balanceSnap(this.token, receiv, "receiver snap");
            const supplySnap = await totalSupplySnap(this.token);

            // Validate approve
            expect(await this.token.allowance(wallet, puller)).to.eq.BN(bn(0));

            // Pull tokens
            await tryCatchRevert(sendFromWallet(wallet, this.token, receiv, transfer), "balance not enough");

            // Validate amounts
            await walletSnap.requireConstant();
            await receivSnap.requireConstant();
            await supplySnap.requireConstant();
            await winnerSnap.requireConstant();
        });
        it("Should fail transfer 1000 tokens using transfer if balance is not enought", async () => {
            const transfer = bn(1000).mul(bn(10).pow(bn(18)));

            // Create wallets
            const wallet = await getFundedWallet(bn(200).mul(bn(10).pow(bn(18))));
            const winner = await preddictWinner(wallet, transfer);
            const receiv = await requestWallet();
            const puller = await requestWallet();

            // Take snaps
            const winnerSnap = await balanceSnap(this.token, winner, "winner");
            const walletSnap = await balanceSnap(this.token, wallet, "wallet");
            const receivSnap = await balanceSnap(this.token, receiv, "receiver snap");
            const supplySnap = await totalSupplySnap(this.token);

            // Validate approve
            expect(await this.token.allowance(wallet, puller)).to.eq.BN(bn(0));

            // Pull tokens
            await tryCatchRevert(sendFromWallet(wallet, this.token, receiv, transfer), "balance not enough");

            // Validate amounts
            await walletSnap.requireConstant();
            await receivSnap.requireConstant();
            await supplySnap.requireConstant();
            await winnerSnap.requireConstant();
        });
        it("Should fail to transfer from if allowance is not enought", async () => {
            const amount = bn(850).mul(bn(10).pow(bn(18)));

            // Create wallets
            const wallet = await getFundedWallet(amount);
            const winner = await preddictWinner(wallet, amount);
            const receiv = await requestWallet();
            const puller = await requestWallet();

            // Take snaps
            const winnerSnap = await balanceSnap(this.token, winner, "winner");
            const walletSnap = await balanceSnap(this.token, wallet, "wallet");
            const receivSnap = await balanceSnap(this.token, receiv, "receiver snap");
            const pullerSnap = await balanceSnap(this.token, puller, "puller");
            const supplySnap = await totalSupplySnap(this.token);

            // Validate approve
            expect(await this.token.allowance(wallet, puller)).to.eq.BN(bn(0));

            // Pull tokens
            await tryCatchRevert(pullFromWallet(puller, this.token, wallet, receiv, amount), "allowance not enough");

            // Validate amounts
            await walletSnap.requireConstant();
            await receivSnap.requireConstant();
            await supplySnap.requireConstant();
            await winnerSnap.requireConstant();
            await pullerSnap.requireConstant();

            // Validate that allowance remained constant
            expect(await this.token.allowance(wallet, puller)).to.eq.BN(bn(0));
        });
        it("Should fail to transfer from if allowance is not zero, but not enought", async () => {
            const amount = bn(850).mul(bn(10).pow(bn(18)));
            const approve = bn(60).mul(bn(10).pow(bn(18)));

            // Create wallets
            const wallet = await getFundedWallet(amount);
            const winner = await preddictWinner(wallet, amount);
            const receiv = await requestWallet();
            const puller = await requestWallet();

            // Take snaps
            const winnerSnap = await balanceSnap(this.token, winner, "winner");
            const walletSnap = await balanceSnap(this.token, wallet, "wallet");
            const receivSnap = await balanceSnap(this.token, receiv, "receiver snap");
            const pullerSnap = await balanceSnap(this.token, puller, "puller");
            const supplySnap = await totalSupplySnap(this.token);

            // Validate approve
            expect(await this.token.allowance(wallet, puller)).to.eq.BN(bn(0));
            await approveFromWallet(wallet, this.token, puller, approve);
            expect(await this.token.allowance(wallet, puller)).to.eq.BN(approve);

            // Pull tokens
            await tryCatchRevert(pullFromWallet(puller, this.token, wallet, receiv, amount), "allowance not enough");

            // Validate amounts
            await walletSnap.requireConstant();
            await receivSnap.requireConstant();
            await supplySnap.requireConstant();
            await winnerSnap.requireConstant();
            await pullerSnap.requireConstant();

            // Validate that allowance remained constant
            expect(await this.token.allowance(wallet, puller)).to.eq.BN(approve);
        });
        it("Should transfer to a whitelisted address as a standard ERC20", async () => {
            const amount = bn(100).mul(bn(10).pow(bn(18)));
            const wallet = await getFundedWallet(amount);
            const receiver = await requestWallet();
            await this.token.setWhitelistedTo(receiver, true, { from: this.owner });

            const senderSnap = await balanceSnap(this.token, wallet, "sender");
            const receiverSnap = await balanceSnap(this.token, receiver, "receiver");
            const supplySnap = await totalSupplySnap(this.token);

            await sendFromWallet(wallet, this.token, receiver, amount);

            await senderSnap.requireDecrease(amount);
            await receiverSnap.requireIncrease(amount);
            await supplySnap.requireConstant();
        });
        it("Should transfer from a whitelisted address as a standard ERC20", async () => {
            const amount = bn(100).mul(bn(10).pow(bn(18)));
            const wallet = await getFundedWallet(amount);
            const receiver = await requestWallet();
            await this.token.setWhitelistedFrom(wallet, true, { from: this.owner });

            const senderSnap = await balanceSnap(this.token, wallet, "sender");
            const receiverSnap = await balanceSnap(this.token, receiver, "receiver");
            const supplySnap = await totalSupplySnap(this.token);

            await sendFromWallet(wallet, this.token, receiver, amount);

            await senderSnap.requireDecrease(amount);
            await receiverSnap.requireIncrease(amount);
            await supplySnap.requireConstant();
        });
        it("Should transferFrom to a whitelisted address as a standard ERC20", async () => {
            const amount = bn(100).mul(bn(10).pow(bn(18)));
            const wallet = await getFundedWallet(amount);
            const receiver = await requestWallet();
            const puller = await requestWallet();
            await this.token.setWhitelistedTo(receiver, true, { from: this.owner });

            const senderSnap = await balanceSnap(this.token, wallet, "sender");
            const receiverSnap = await balanceSnap(this.token, receiver, "receiver");
            const supplySnap = await totalSupplySnap(this.token);

            await approveFromWallet(wallet, this.token, puller, amount);
            await pullFromWallet(puller, this.token, wallet, receiver, amount);

            await senderSnap.requireDecrease(amount);
            await receiverSnap.requireIncrease(amount);
            await supplySnap.requireConstant();
        });
        it("Should transferFrom from a whitelisted address as a standard ERC20", async () => {
            const amount = bn(100).mul(bn(10).pow(bn(18)));
            const wallet = await getFundedWallet(amount);
            const receiver = await requestWallet();
            const puller = await requestWallet();
            await this.token.setWhitelistedFrom(wallet, true, { from: this.owner });

            const senderSnap = await balanceSnap(this.token, wallet, "sender");
            const receiverSnap = await balanceSnap(this.token, receiver, "receiver");
            const supplySnap = await totalSupplySnap(this.token);

            await approveFromWallet(wallet, this.token, puller, amount);
            await pullFromWallet(puller, this.token, wallet, receiver, amount);

            await senderSnap.requireDecrease(amount);
            await receiverSnap.requireIncrease(amount);
            await supplySnap.requireConstant();
        });
    });
    it("Should fail to init twice", async () => {
        await tryCatchRevert(this.token.init(accounts[0], bn(100000)), "only owner");
    });
    describe("Test only owner methods", async () => {
        it("setName", async () => {
            await tryCatchRevert(this.token.setName("test"), "only owner");
        });
        it("setExtraGas", async () => {
            await tryCatchRevert(this.token.setExtraGas(90), "only owner");
        });
        it("setWhitelistTo", async () => {
            await tryCatchRevert(this.token.setWhitelistedTo(accounts[1], true), "only owner");
        });
        it("setWhitelistFrom", async () => {
            await tryCatchRevert(this.token.setWhitelistedFrom(accounts[1], true), "only owner");
        });
        it("setHeap", async () => {
            await tryCatchRevert(this.token.setHeap(accounts[1]), "only owner");
        });
        it("setMaxClaimedBy", async () => {
            await tryCatchRevert(this.reparter.setMaxClaimedBy(90), "only owner");
        });
        it("setSigner", async () => {
            await tryCatchRevert(this.reparter.setSigner(accounts[2], true), "only owner");
        });
        it("setSigners", async () => {
            await tryCatchRevert(this.reparter.setSigners([accounts[1], accounts[2]], [true, true]), "only owner");
        });
        it("setCustomMaxClaimedBy", async () => {
            await tryCatchRevert(this.reparter.setCustomMaxClaimedBy(accounts[3], 900), "only owner");
        });
    });
});
