// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {DcaTestBase} from "./DcaPlan.Base.t.sol";
import {DcaPlan} from "../DcaPlan.sol";
import {DcaFactory} from "../DcaFactory.sol";

contract DcaFactoryTest is DcaTestBase {
    uint256 internal constant NS = 1e12;

    function _create(uint96 a, uint32 r, uint32 i, uint16 d, uint256 value) internal returns (address) {
        vm.deal(other, other.balance + value);
        vm.prank(other);
        return factory.createPlan{value: value}(a, r, i, d);
    }

    function _required(uint96 a, uint32 r) internal pure returns (uint256) {
        return uint256(r) * a * NS + uint256(r) * 1e16;
    }

    // ───────────────────────── constructor ─────────────────────────

    function test_Constructor_StoresImplementation() public view {
        assertEq(factory.implementation(), address(impl));
        assertEq(factory.totalPlans(), 1); // the default plan from setUp
    }

    function test_Constructor_RevertsOnZeroImplementation() public {
        vm.expectRevert(abi.encodeWithSelector(DcaFactory.InvalidImplementation.selector, address(0)));
        new DcaFactory(address(0));
    }

    function test_Constructor_RevertsOnImplementationWithoutCode() public {
        vm.expectRevert(abi.encodeWithSelector(DcaFactory.InvalidImplementation.selector, other));
        new DcaFactory(other);
    }

    // ───────────────────────── parameter bounds (reverts) ─────────────────────────

    function test_Revert_AmountBelowMin() public {
        vm.expectRevert(abi.encodeWithSelector(DcaFactory.InvalidAmountPerRound.selector, uint96(1e6 - 1)));
        _create(1e6 - 1, 1, 3600, 100, 100e18);
    }

    function test_Revert_AmountZero() public {
        vm.expectRevert(abi.encodeWithSelector(DcaFactory.InvalidAmountPerRound.selector, uint96(0)));
        _create(0, 1, 3600, 100, 100e18);
    }

    function test_Revert_RoundsZero() public {
        vm.expectRevert(abi.encodeWithSelector(DcaFactory.InvalidRounds.selector, uint32(0)));
        _create(1e6, 0, 3600, 100, 100e18);
    }

    function test_Revert_RoundsAboveMax() public {
        vm.expectRevert(abi.encodeWithSelector(DcaFactory.InvalidRounds.selector, uint32(366)));
        _create(1e6, 366, 3600, 100, 1_000e18);
    }

    function test_Revert_IntervalBelowMin() public {
        vm.expectRevert(abi.encodeWithSelector(DcaFactory.InvalidInterval.selector, uint32(3599)));
        _create(1e6, 1, 3599, 100, 100e18);
    }

    function test_Revert_IntervalZero() public {
        vm.expectRevert(abi.encodeWithSelector(DcaFactory.InvalidInterval.selector, uint32(0)));
        _create(1e6, 1, 0, 100, 100e18);
    }

    function test_Revert_IntervalAboveMax() public {
        vm.expectRevert(abi.encodeWithSelector(DcaFactory.InvalidInterval.selector, uint32(2_592_001)));
        _create(1e6, 1, 2_592_001, 100, 100e18);
    }

    function test_Revert_DeviationBelowMin() public {
        vm.expectRevert(abi.encodeWithSelector(DcaFactory.InvalidDeviation.selector, uint16(9)));
        _create(1e6, 1, 3600, 9, 100e18);
    }

    function test_Revert_DeviationZero() public {
        vm.expectRevert(abi.encodeWithSelector(DcaFactory.InvalidDeviation.selector, uint16(0)));
        _create(1e6, 1, 3600, 0, 100e18);
    }

    function test_Revert_DeviationAboveMax() public {
        vm.expectRevert(abi.encodeWithSelector(DcaFactory.InvalidDeviation.selector, uint16(5001)));
        _create(1e6, 1, 3600, 5001, 100e18);
    }

    function test_Revert_DeviationFullBps() public {
        vm.expectRevert(abi.encodeWithSelector(DcaFactory.InvalidDeviation.selector, uint16(10_000)));
        _create(1e6, 1, 3600, 10_000, 100e18);
    }

    function test_Revert_InsufficientFundingOneWeiShort() public {
        uint256 req = _required(10e6, 10);
        vm.expectRevert(abi.encodeWithSelector(DcaFactory.InsufficientFunding.selector, req - 1, req));
        _create(10e6, 10, 3600, 100, req - 1);
    }

    function test_Revert_InsufficientFundingNoValue() public {
        uint256 req = _required(1e6, 1);
        vm.expectRevert(abi.encodeWithSelector(DcaFactory.InsufficientFunding.selector, 0, req));
        _create(1e6, 1, 3600, 100, 0);
    }

    function test_Revert_PrincipalOnlyIsNotEnough() public {
        // principal covered but no room for the 0.01 USDC minimum tip per round
        uint256 principal = 10 * 10e6 * NS;
        vm.expectRevert(
            abi.encodeWithSelector(DcaFactory.InsufficientFunding.selector, principal, _required(10e6, 10))
        );
        _create(10e6, 10, 3600, 100, principal);
    }

    function test_Revert_ValidationOrder() public {
        // everything invalid -> amount is checked first, then rounds, interval, deviation, funding
        vm.expectRevert(abi.encodeWithSelector(DcaFactory.InvalidAmountPerRound.selector, uint96(0)));
        _create(0, 0, 0, 0, 0);
        vm.expectRevert(abi.encodeWithSelector(DcaFactory.InvalidRounds.selector, uint32(0)));
        _create(1e6, 0, 0, 0, 0);
        vm.expectRevert(abi.encodeWithSelector(DcaFactory.InvalidInterval.selector, uint32(0)));
        _create(1e6, 1, 0, 0, 0);
        vm.expectRevert(abi.encodeWithSelector(DcaFactory.InvalidDeviation.selector, uint16(0)));
        _create(1e6, 1, 3600, 0, 0);
    }

    function test_Revert_LeavesRegistryUntouched() public {
        uint256 total = factory.totalPlans();
        vm.expectRevert();
        _create(1e6, 0, 3600, 100, 100e18);
        assertEq(factory.totalPlans(), total);
        assertEq(factory.planCount(other), 0);
    }

    // ───────────────────────── parameter bounds (accepted edges) ─────────────────────────

    function test_Accepts_MinimumEverything() public {
        address p = _create(1e6, 1, 3600, 10, _required(1e6, 1));
        assertEq(DcaPlan(payable(p)).amountPerRound(), 1e6);
        assertEq(DcaPlan(payable(p)).tipPerRound(), 1e16);
    }

    function test_Accepts_MaximumRoundsIntervalDeviation() public {
        address p = _create(1e6, 365, 2_592_000, 5000, _required(1e6, 365));
        DcaPlan d = DcaPlan(payable(p));
        assertEq(d.roundsLeft(), 365);
        assertEq(d.intervalSecs(), 2_592_000);
        assertEq(d.maxDeviationBps(), 5000);
        assertEq(d.tipPerRound(), 1e16);
    }

    function test_Accepts_LargeAmountPerRound() public {
        uint96 big = 1_000_000e6;
        address p = _create(big, 2, 3600, 100, _required(big, 2));
        assertEq(address(p).balance, _required(big, 2));
    }

    // ───────────────────────── funding arithmetic ─────────────────────────

    function test_Funding_TenByTenWith101LeavesOneUsdcReserve() public view {
        assertEq(plan.tipPerRound(), 0.1e18);
        assertEq(address(plan).balance, 101e18);
        assertEq(plan.principalLeft(), 100e18);
        // reserve = balance - principal = 1 USDC, 10 x 0.1 USDC tips, no dust
        assertEq(address(plan).balance - plan.principalLeft(), 1e18);
        assertEq(plan.tipPerRound() * ROUNDS, 1e18);
    }

    function test_Funding_ExactMinimumGivesMinTip() public {
        address p = _create(5e6, 4, 3600, 100, _required(5e6, 4));
        assertEq(DcaPlan(payable(p)).tipPerRound(), 1e16);
        assertEq(p.balance, _required(5e6, 4));
    }

    function test_Funding_DustStaysInPlan() public {
        // reserve 1e18 + 7 over 3 rounds -> tip = floor((1e18+7)/3), dust = (1e18+7) % 3
        uint256 principal = 3 * 2e6 * NS;
        uint256 value = principal + 1e18 + 7;
        address p = _create(2e6, 3, 3600, 100, value);
        DcaPlan d = DcaPlan(payable(p));
        uint256 reserve = 1e18 + 7;
        uint256 tip = reserve / 3;
        assertEq(d.tipPerRound(), tip);
        uint256 dust = reserve - tip * 3;
        assertEq(dust, reserve % 3);
        assertEq(p.balance, value, "everything is forwarded to the clone");
        assertEq(p.balance - d.principalLeft() - tip * 3, dust);
        assertEq(address(factory).balance, 0, "factory never holds funds");
    }

    function testFuzz_Funding(uint96 amount, uint32 rounds, uint256 extra) public {
        amount = uint96(bound(amount, 1e6, 1_000_000e6));
        rounds = uint32(bound(rounds, 1, 365));
        uint256 principal = uint256(rounds) * amount * NS;
        extra = bound(extra, uint256(rounds) * 1e16, 1_000e18);
        uint256 value = principal + extra;

        address p = _create(amount, rounds, 3600, 100, value);
        DcaPlan d = DcaPlan(payable(p));

        assertEq(p.balance, value);
        assertEq(address(factory).balance, 0);
        assertEq(d.tipPerRound(), extra / rounds);
        assertGe(d.tipPerRound(), 1e16);
        // reserve covers all tips; dust is strictly less than one wei per round
        uint256 dust = extra - d.tipPerRound() * rounds;
        assertLt(dust, rounds);
        assertEq(d.principalLeft(), principal);
    }

    // ───────────────────────── registration & views ─────────────────────────

    function test_Create_InitializesPlan() public view {
        assertEq(plan.owner(), owner);
        assertEq(plan.amountPerRound(), AMOUNT);
        assertEq(plan.roundsLeft(), ROUNDS);
        assertEq(plan.intervalSecs(), INTERVAL);
        assertEq(plan.maxDeviationBps(), DEV);
        assertEq(plan.nextDue(), T0, "first round immediately due");
        assertEq(plan.factory(), address(factory));
        assertTrue(plan.isDue());
    }

    function test_Create_RegistersPlan() public view {
        assertEq(factory.totalPlans(), 1);
        assertEq(factory.planCount(owner), 1);
        address[] memory ps = factory.plansOf(owner);
        assertEq(ps.length, 1);
        assertEq(ps[0], address(plan));
        assertEq(factory.planCount(other), 0);
        assertEq(factory.plansOf(other).length, 0);
    }

    function test_Create_EmitsPlanCreated() public {
        address predicted = vm.computeCreateAddress(address(factory), vm.getNonce(address(factory)));
        vm.expectEmit(true, true, false, true, address(factory));
        emit DcaFactory.PlanCreated(other, predicted, 3e6, 7, 7200, 250, (50e18 - 7 * 3e6 * NS) / 7);
        address p = _create(3e6, 7, 7200, 250, 50e18);
        assertEq(p, predicted);
    }

    function test_Create_MultiplePlansPerOwnerAndAcrossOwners() public {
        address p1 = _create(1e6, 1, 3600, 100, 2e18);
        address p2 = _create(2e6, 2, 3600, 100, 5e18);
        vm.deal(owner, 10e18);
        vm.prank(owner);
        address p3 = factory.createPlan{value: 2e18}(1e6, 1, 3600, 100);

        assertEq(factory.totalPlans(), 4);
        assertEq(factory.planCount(other), 2);
        assertEq(factory.planCount(owner), 2);
        address[] memory o = factory.plansOf(other);
        assertEq(o[0], p1);
        assertEq(o[1], p2);
        assertEq(factory.plansOf(owner)[1], p3);
        assertTrue(p1 != p2 && p2 != p3 && p1 != p3 && p3 != address(plan));
        assertEq(DcaPlan(payable(p1)).owner(), other);
        assertEq(DcaPlan(payable(p3)).owner(), owner);
        assertEq(DcaPlan(payable(p2)).amountPerRound(), 2e6, "plans keep independent parameters");
    }

    function test_Clone_SharesImplementationDependencies() public view {
        assertEq(address(plan.usdc()), address(usdc));
        assertEq(address(plan.cirBtc()), address(btc));
        assertEq(plan.adapter(), address(adapter));
        assertEq(address(plan.pyth()), address(pyth));
        assertEq(plan.priceId(), PRICE_ID);
        assertEq(address(plan).code.length, 45, "EIP-1167 minimal proxy");
    }

    function test_Clones_HaveIndependentState() public {
        address p = _create(1e6, 1, 3600, 100, 2e18);
        _exec();
        assertEq(plan.roundsLeft(), ROUNDS - 1);
        assertEq(DcaPlan(payable(p)).roundsLeft(), 1);
        assertEq(p.balance, 2e18);
    }
}
