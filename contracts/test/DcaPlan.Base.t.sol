// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {DcaPlan, IPyth} from "../DcaPlan.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DcaFactory} from "../DcaFactory.sol";
import {MockNativeUsdc} from "../test-helpers/MockNativeUsdc.sol";
import {MockCirBtc} from "../test-helpers/MockCirBtc.sol";
import {MockPyth} from "../test-helpers/MockPyth.sol";
import {MockAdapter} from "../test-helpers/MockAdapter.sol";

/// @dev Shared fixtures. No test functions here.
abstract contract DcaTestBase is Test {
    bytes32 internal constant PRICE_ID = keccak256("BTC/USD");
    uint256 internal constant T0 = 1_700_000_000;

    // default plan: 10 USDC x 10 rounds, daily, 1% floor, 101 USDC deposited
    uint96 internal constant AMOUNT = 10e6;
    uint32 internal constant ROUNDS = 10;
    uint32 internal constant INTERVAL = 1 days;
    uint16 internal constant DEV = 100;
    uint256 internal constant DEPOSIT = 101e18;
    uint256 internal constant TIP = 0.1e18;

    // default oracle: BTC = 60,000 USD, expo -8. 10 USD -> 16,666 sats; floor at 1% -> 16,499
    int64 internal constant PRICE = 60_000e8;
    uint256 internal constant PYTH_FEE = 0.001e18;
    uint256 internal constant EXPECTED_SATS = 16_666;
    uint256 internal constant MIN_OUT = 16_499;
    uint256 internal constant BTC_OUT = 16_600;

    MockNativeUsdc internal usdc;
    MockCirBtc internal btc;
    MockPyth internal pyth;
    MockAdapter internal adapter;
    DcaPlan internal impl;
    DcaFactory internal factory;
    DcaPlan internal plan;

    address internal owner = makeAddr("owner");
    address internal keeper = makeAddr("keeper");
    address internal other = makeAddr("other");

    struct Snap {
        uint32 roundsLeft;
        uint64 nextDue;
        uint256 planNative;
        uint256 planBtc;
        uint256 ownerNative;
        uint256 ownerBtc;
        uint256 keeperNative;
        uint256 pythNative;
        uint256 adapterNative;
        uint256 allowance;
    }

    function setUp() public virtual {
        vm.warp(T0);
        usdc = new MockNativeUsdc();
        btc = new MockCirBtc();
        pyth = new MockPyth();
        adapter = new MockAdapter(usdc, btc);
        impl = new DcaPlan(IERC20(address(usdc)), IERC20(address(btc)), address(adapter), IPyth(address(pyth)), PRICE_ID);
        factory = new DcaFactory(address(impl));

        pyth.setPrice(PRICE, 10e8, -8);
        pyth.setFee(PYTH_FEE);
        pyth.setExpectedId(PRICE_ID);
        _fresh();

        vm.deal(owner, 1_000e18);
        vm.deal(keeper, 1_000e18);
        vm.deal(other, 1_000e18);

        plan = _createPlan(owner, AMOUNT, ROUNDS, INTERVAL, DEV, DEPOSIT);
    }

    function _createPlan(address who, uint96 amount, uint32 rounds, uint32 interval, uint16 dev, uint256 value)
        internal
        returns (DcaPlan p)
    {
        vm.deal(who, who.balance + value);
        vm.prank(who);
        p = DcaPlan(payable(factory.createPlan{value: value}(amount, rounds, interval, dev)));
    }

    /// @dev Pyth price published "now".
    function _fresh() internal {
        pyth.setPublishTime(block.timestamp);
    }

    function _updates() internal pure returns (bytes[] memory u) {
        u = new bytes[](1);
        u[0] = hex"deadbeef";
    }

    function _swapCall(DcaPlan p, uint256 usdcIn, uint256 btcOut) internal pure returns (bytes memory) {
        return abi.encodeCall(MockAdapter.swap, (address(p), usdcIn, btcOut));
    }

    function _swapCall(uint256 btcOut) internal view returns (bytes memory) {
        return _swapCall(plan, AMOUNT, btcOut);
    }

    /// @dev Keeper `who` executes a round on the default plan with fresh price, paying `value`.
    function _exec(address who, uint256 value, uint256 btcOut) internal {
        _fresh();
        vm.prank(who);
        plan.executeRound{value: value}(_swapCall(btcOut), _updates());
    }

    function _exec() internal {
        _exec(keeper, PYTH_FEE, BTC_OUT);
    }

    function _snap() internal view returns (Snap memory s) {
        s.roundsLeft = plan.roundsLeft();
        s.nextDue = plan.nextDue();
        s.planNative = address(plan).balance;
        s.planBtc = btc.balanceOf(address(plan));
        s.ownerNative = owner.balance;
        s.ownerBtc = btc.balanceOf(owner);
        s.keeperNative = keeper.balance;
        s.pythNative = address(pyth).balance;
        s.adapterNative = address(adapter).balance;
        s.allowance = usdc.allowance(address(plan), address(adapter));
    }

    function _assertUnchanged(Snap memory a) internal view {
        Snap memory b = _snap();
        assertEq(b.roundsLeft, a.roundsLeft, "roundsLeft");
        assertEq(b.nextDue, a.nextDue, "nextDue");
        assertEq(b.planNative, a.planNative, "plan native");
        assertEq(b.planBtc, a.planBtc, "plan btc");
        assertEq(b.ownerNative, a.ownerNative, "owner native");
        assertEq(b.ownerBtc, a.ownerBtc, "owner btc");
        assertEq(b.keeperNative, a.keeperNative, "keeper native");
        assertEq(b.pythNative, a.pythNative, "pyth native");
        assertEq(b.adapterNative, a.adapterNative, "adapter native");
        assertEq(b.allowance, a.allowance, "allowance");
    }

    /// @dev Execute with expected revert (raw selector+args encoded by caller) and check nothing moved.
    function _expectExecRevert(bytes memory err, uint256 value, uint256 btcOut) internal {
        _fresh();
        _expectExecRevertKeepPrice(err, value, btcOut);
    }

    /// @dev Same, without refreshing the Pyth publish time (for stale-price tests).
    function _expectExecRevertKeepPrice(bytes memory err, uint256 value, uint256 btcOut) internal {
        Snap memory s = _snap();
        vm.expectRevert(err);
        vm.prank(keeper);
        plan.executeRound{value: value}(_swapCall(btcOut), _updates());
        _assertUnchanged(s);
    }

    function _indexOfLog(Vm.Log[] memory logs, address emitter, bytes32 sig) internal pure returns (uint256) {
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == emitter && logs[i].topics[0] == sig) return i;
        }
        return type(uint256).max;
    }
}
