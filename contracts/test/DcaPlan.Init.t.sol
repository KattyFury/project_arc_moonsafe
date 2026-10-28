// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DcaTestBase} from "./DcaPlan.Base.t.sol";
import {DcaPlan, IPyth} from "../DcaPlan.sol";
import {ForceSender} from "../test-helpers/Actors.sol";

contract DcaPlanInitTest is DcaTestBase {
    DcaPlan internal raw; // standalone, uninitialized clone

    function setUp() public override {
        super.setUp();
        raw = DcaPlan(payable(Clones.clone(address(impl))));
    }

    // ───────────────────────── constructor ─────────────────────────

    function test_Constructor_StoresDependencies() public view {
        assertEq(address(impl.usdc()), address(usdc));
        assertEq(address(impl.cirBtc()), address(btc));
        assertEq(impl.adapter(), address(adapter));
        assertEq(address(impl.pyth()), address(pyth));
        assertEq(impl.priceId(), PRICE_ID);
    }

    function _ctor(address u, address c, address a, address p) internal {
        new DcaPlan(IERC20(u), IERC20(c), a, IPyth(p), PRICE_ID);
    }

    function test_Constructor_RevertsOnZeroUsdc() public {
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.ZeroAddress.selector, bytes32("usdc")));
        _ctor(address(0), address(btc), address(adapter), address(pyth));
    }

    function test_Constructor_RevertsOnZeroCirBtc() public {
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.ZeroAddress.selector, bytes32("cirBtc")));
        _ctor(address(usdc), address(0), address(adapter), address(pyth));
    }

    function test_Constructor_RevertsOnZeroAdapter() public {
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.ZeroAddress.selector, bytes32("adapter")));
        _ctor(address(usdc), address(btc), address(0), address(pyth));
    }

    function test_Constructor_RevertsOnZeroPyth() public {
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.ZeroAddress.selector, bytes32("pyth")));
        _ctor(address(usdc), address(btc), address(adapter), address(0));
    }

    // ───────────────────────── implementation locking ─────────────────────────

    function test_Impl_CannotBeInitialized() public {
        vm.deal(other, 1_000e18);
        vm.prank(other);
        vm.expectRevert(DcaPlan.AlreadyInitialized.selector);
        impl.initialize{value: 11e18}(other, AMOUNT, 1, INTERVAL, DEV, TIP);
        assertEq(impl.owner(), address(0));
        assertEq(impl.roundsLeft(), 0);
        assertEq(impl.factory(), address(0));
    }

    function test_Impl_CannotExecuteCancelOrSweep() public {
        vm.expectRevert(DcaPlan.NoRoundsLeft.selector);
        vm.prank(keeper);
        impl.executeRound(hex"", _updates());

        vm.expectRevert(abi.encodeWithSelector(DcaPlan.Unauthorized.selector, other));
        vm.prank(other);
        impl.cancel();

        vm.expectRevert(DcaPlan.NotInitialized.selector);
        impl.sweep();
        assertFalse(impl.isDue());
    }

    function test_Impl_AnyCallerCannotCancelEvenZeroAddress() public {
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.Unauthorized.selector, address(this)));
        impl.cancel();
    }

    // ───────────────────────── initialize authorization ─────────────────────────

    function test_Initialize_SecondCallReverts_AnyCaller() public {
        address[3] memory callers = [owner, address(factory), other];
        for (uint256 i; i < 3; i++) {
            vm.deal(callers[i], 1_000e18);
            vm.prank(callers[i]);
            vm.expectRevert(DcaPlan.AlreadyInitialized.selector);
            plan.initialize{value: 11e18}(callers[i], AMOUNT, 1, INTERVAL, DEV, TIP);
        }
        assertEq(plan.owner(), owner);
        assertEq(plan.roundsLeft(), ROUNDS);
        assertEq(plan.factory(), address(factory));
        assertEq(address(plan).balance, DEPOSIT);
    }

    function test_Initialize_CheckedBeforeInputValidation() public {
        vm.expectRevert(DcaPlan.AlreadyInitialized.selector);
        plan.initialize(address(0), 0, 0, 0, 20_000, 0);
    }

    function test_Initialize_FirstCallerBecomesFactoryOnStandaloneClone() public {
        vm.prank(other);
        raw.initialize{value: 11e18}(owner, AMOUNT, 1, INTERVAL, DEV, 1e18);
        assertEq(raw.factory(), other);
        assertEq(raw.owner(), owner);
        assertEq(raw.nextDue(), block.timestamp);
        assertEq(raw.tipPerRound(), 1e18);
        // nobody, not even the recorded factory, can initialize again
        vm.prank(other);
        vm.expectRevert(DcaPlan.AlreadyInitialized.selector);
        raw.initialize(other, AMOUNT, 1, INTERVAL, DEV, 0);
    }

    function test_Initialize_ZeroOwnerReverts() public {
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.ZeroAddress.selector, bytes32("owner")));
        raw.initialize(address(0), AMOUNT, 1, INTERVAL, DEV, 0);
    }

    function _badSchedule(uint96 a, uint32 r, uint32 i, uint16 d) internal {
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.InvalidSchedule.selector, a, r, i, d));
        raw.initialize(owner, a, r, i, d, 0);
    }

    function test_Initialize_InvalidScheduleVariants() public {
        _badSchedule(0, 1, 3600, 100);
        _badSchedule(1e6, 0, 3600, 100);
        _badSchedule(1e6, 1, 0, 100);
        _badSchedule(1e6, 1, 3600, 10_001);
    }

    function test_Initialize_AcceptsZeroDeviationAndFullBps() public {
        raw.initialize{value: 10e18}(owner, AMOUNT, 1, INTERVAL, 0, 0);
        assertEq(raw.maxDeviationBps(), 0);
        DcaPlan raw2 = DcaPlan(payable(Clones.clone(address(impl))));
        raw2.initialize{value: 10e18}(owner, AMOUNT, 1, INTERVAL, 10_000, 0);
        assertEq(raw2.maxDeviationBps(), 10_000);
    }

    function test_Initialize_InsufficientFunding() public {
        // principal 2 * 10e6 * 1e12 = 20e18, tips 2 * 1e18
        uint256 required = 22e18;
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.InsufficientFunding.selector, required - 1, required));
        raw.initialize{value: required - 1}(owner, AMOUNT, 2, INTERVAL, DEV, 1e18);
        // exact funding is fine
        raw.initialize{value: required}(owner, AMOUNT, 2, INTERVAL, DEV, 1e18);
        assertEq(address(raw).balance, required);
    }

    function test_Initialize_FailedAttemptDoesNotLockClone() public {
        vm.expectRevert();
        raw.initialize(address(0), AMOUNT, 1, INTERVAL, DEV, 0);
        assertEq(raw.owner(), address(0));
        raw.initialize{value: 10e18}(owner, AMOUNT, 1, INTERVAL, DEV, 0);
        assertEq(raw.owner(), owner);
    }

    function test_Uninitialized_ClonePermissions() public {
        vm.expectRevert(DcaPlan.NoRoundsLeft.selector);
        raw.executeRound(hex"", _updates());
        vm.expectRevert(DcaPlan.NotInitialized.selector);
        raw.sweep();
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.Unauthorized.selector, other));
        vm.prank(other);
        raw.cancel();
    }

    // ───────────────────────── receive / views ─────────────────────────

    function test_PlainDepositsRejected() public {
        vm.deal(other, 10e18);
        vm.prank(other);
        (bool ok, bytes memory ret) = address(plan).call{value: 1e18}("");
        assertFalse(ok);
        assertEq(bytes4(ret), DcaPlan.DirectDepositDisabled.selector);
        assertEq(address(plan).balance, DEPOSIT);
        (ok,) = address(impl).call{value: 1}("");
        assertFalse(ok);
    }

    function test_ForcedValueIsDustForSweep() public {
        new ForceSender{value: 5e18}(payable(address(plan)));
        assertEq(address(plan).balance, DEPOSIT + 5e18);
        assertEq(plan.principalLeft(), 100e18, "forced value never counts as principal");
    }

    function test_IsDue_FollowsSchedule() public {
        assertTrue(plan.isDue());
        _exec();
        assertFalse(plan.isDue());
        skip(INTERVAL - 1);
        assertFalse(plan.isDue());
        skip(1);
        assertTrue(plan.isDue());
    }

    function test_PrincipalLeft_ShrinksPerRound() public {
        assertEq(plan.principalLeft(), 100e18);
        _exec();
        assertEq(plan.principalLeft(), 90e18);
    }

    function test_Views_AfterAllRounds() public {
        for (uint256 i; i < ROUNDS; i++) {
            _exec();
            skip(INTERVAL);
        }
        assertEq(plan.principalLeft(), 0);
        assertFalse(plan.isDue());
    }
}
