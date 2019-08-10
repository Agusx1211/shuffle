const BN = web3.utils.BN;
const expect = require('chai')
    .use(require('bn-chai')(BN))
    .expect;

module.exports.balanceSnap = async (token, address, account = "") => {
    const snapBalance = await token.balanceOf(address);
    return {
        requireConstant: async function () {
            expect(
                snapBalance,
                `${account} balance should remain constant`
            ).to.eq.BN(
                await token.balanceOf(address)
            );
        },
        requireIncrease: async function (delta) {
            const realincrease = (await token.balanceOf(address)).sub(snapBalance);
            expect(
                snapBalance.add(delta),
                `${account} should increase by ${delta} - but increased by ${realincrease}`
            ).to.eq.BN(
                await token.balanceOf(address)
            );
        },
        requireDecrease: async function (delta) {
            const realdecrease = snapBalance.sub(await token.balanceOf(address));
            expect(
                snapBalance.sub(delta),
                `${account} should decrease by ${delta} - but decreased by ${realdecrease}`
            ).to.eq.BN(
                await token.balanceOf(address)
            );
        },
        restore: async function () {
            await token.setBalance(address, snapBalance);
        }
    }
}

module.exports.totalSupplySnap = async (token) => {
    const snapBalance = await token.totalSupply();
    return {
        requireConstant: async function () {
            expect(
                snapBalance,
                `supply supply should remain constant`
            ).to.eq.BN(
                await token.totalSupply()
            );
        },
        requireIncrease: async function (delta) {
            expect(
                snapBalance.add(delta),
                `supply should increase by ${delta}`
            ).to.eq.BN(
                await token.totalSupply()
            );
        },
        requireDecrease: async function (delta) {
            const realdecrease = snapBalance.sub(await token.totalSupply());
            expect(
                snapBalance.sub(delta),
                `supply should decrease by ${delta}  - but decreased by ${realdecrease}`
            ).to.eq.BN(
                await token.totalSupply()
            );
        }
    }
}

module.exports.tryCatchRevert = async (promise, message) => {
    let headMsg = 'revert ';
    if (message === '') {
        headMsg = headMsg.slice(0, headMsg.length - 1);
        console.warn('    \u001b[93m\u001b[2m\u001b[1m⬐ Warning:\u001b[0m\u001b[30m\u001b[1m There is an empty revert/require message');
    }
    try {
        if (promise instanceof Function) {
            await promise();
        } else {
            await promise;
        }
    } catch (error) {
        assert(
            error.message.search(headMsg + message) >= 0 || process.env.SOLIDITY_COVERAGE,
            'Expected a revert \'' + headMsg + message + '\', got ' + error.message + '\' instead'
        );
        return;
    }
    assert.fail('Expected throw not received');
};
