const BN = web3.utils.BN;
const expect = require('chai')
    .use(require('bn-chai')(BN))
    .expect;

module.exports.balanceSnap = async (token, address, account = "") => {
    const snapBalance = await token.balanceOf(address);
    return {
        requireConstant: async function() {
            expect(
                snapBalance,
                `${account} balance should remain constant`
            ).to.eq.BN(
                await token.balanceOf(address)
            );
        },
        requireIncrease: async function(delta) {
            expect(
                snapBalance.add(delta),
                `${account} should increase by ${delta}`
            ).to.eq.BN(
                await token.balanceOf(address)
            );
        },
        requireDecrease: async function(delta) {
            expect(
                snapBalance.sub(delta),
                `${account} should decrease by ${delta}`
            ).to.eq.BN(
                await token.balanceOf(address)
            );
        },
        restore: async function() {
            await token.setBalance(address, snapBalance);
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
