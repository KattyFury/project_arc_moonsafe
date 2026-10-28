// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {DcaTestBase} from "./DcaPlan.Base.t.sol";
import {DcaPlan} from "../DcaPlan.sol";
import {MockNativeUsdc} from "../test-helpers/MockNativeUsdc.sol";
import {MockCirBtc} from "../test-helpers/MockCirBtc.sol";
import {MockPyth} from "../test-helpers/MockPyth.sol";
import {MockAdapter} from "../test-helpers/MockAdapter.sol";
import {DcaKeeper} from "../test-helpers/DcaActors.sol";
import {ForceSender} from "../test-helpers/Actors.sol";

/// @dev Drives executeRound (with many adapter / oracle misbehaviours), cancel, sweep, time and forced value.
contract DcaHandler is Test {
    DcaPlan public plan;
    MockCirBtc public btc;
    MockPyth public pyth;
    MockAdapter public adapter;
    address public owner;
    uint256 public immutable amount;
    uint256 public immutable tip;

    address[] public keepers; // EOAs followed by contract keepers
    uint256 public eoaKeepers;
    DcaKeeper public honestKeeper;
    DcaKeeper public rejectingKeeper;

    uint256 public startTotal;
    uint256 public ownerStart;
    uint256 public handlerStart;
    uint256[] public keeperStart;

    uint256 public ghostRounds;
    uint256 public ghostSpentUnits;
    uint256 public ghostBtc;
    uint256 public ghostFees;
    uint256 public ghostOwnerNative;
    uint256 public ghostForced;
    uint256 public ghostDonatedBtc;
    uint256 public ghostSweptNative;
    uint256 public ghostSweptBtc;
    uint256 public successfulCalls;
    uint256 public protectedReverts;
    bool public cancelled;

    constructor(DcaPlan plan_, MockCirBtc btc_, MockPyth pyth_, MockAdapter adapter_, address owner_) {
        plan = plan_;
        btc = btc_;
        pyth = pyth_;
        adapter = adapter_;
        owner = owner_;
        amount = plan_.amountPerRound();
        tip = plan_.tipPerRound();
        for (uint256 i; i < 4; i++) {
            address k = address(uint160(0xBEEF00 + i));
            vm.deal(k, 1_000 ether);
            keepers.push(k);
            keeperStart.push(k.balance);
        }
        eoaKeepers = 4;
        honestKeeper = new DcaKeeper(plan_);
        rejectingKeeper = new DcaKeeper(plan_);
        rejectingKeeper.setRejectAt(1);
        keepers.push(address(honestKeeper));
        keepers.push(address(rejectingKeeper));
        keeperStart.push(0);
        keeperStart.push(0);
        vm.deal(address(this), 1_000 ether);
        handlerStart = address(this).balance;
        ownerStart = owner_.balance;
        startTotal = totalNative();
    }

    function totalNative() public view returns (uint256 t) {
        t = address(plan).balance + owner.balance + address(pyth).balance + address(adapter).balance
            + address(this).balance;
        for (uint256 i; i < keepers.length; i++) {
            t += keepers[i].balance;
        }
    }

    /// @dev Net native gain of all keeper-side actors. The handler funds contract keepers' calls and
    /// the forced-value donations, so its own delta (donations added back) is part of the keeper side.
    function keeperNet() public view returns (int256 net) {
        net = int256(address(this).balance) - int256(handlerStart) + int256(ghostForced);
        for (uint256 i; i < keepers.length; i++) {
            net += int256(keepers[i].balance) - int256(keeperStart[i]);
        }
    }

    // ───────────────── actions ─────────────────

    function execute(uint256 keeperSeed, uint256 extra, uint256 modeSeed, uint256 factorBps, uint256 priceSeed)
        external
    {
        uint256 mode = modeSeed % 12;
        int64 price = int64(int256(bound(priceSeed, 20_000e8, 150_000e8)));
        uint64 conf = mode == 8 ? uint64(price) / 50 : uint64(price) / 500;
        pyth.setPrice(price, conf, -8);
        pyth.setPublishTime(mode == 9 ? block.timestamp - 61 : block.timestamp);
        pyth.setRevertOnUpdate(mode == 10);
        _setAdapterMode(mode);

        uint256 btcOut = (amount * 100 * 1e8 / uint64(price)) * bound(factorBps, 9000, 11_000) / 10_000;
        uint256 fee = pyth.fee();
        uint256 value = fee + bound(extra, 0, 1e17);
        address k = keepers[keeperSeed % keepers.length];
        bytes memory data = abi.encodeCall(MockAdapter.swap, (address(plan), amount, btcOut));
        bytes[] memory upd = new bytes[](1);
        upd[0] = hex"01";

        vm.recordLogs();
        bool ok;
        if (k == address(honestKeeper) || k == address(rejectingKeeper)) {
            try DcaKeeper(payable(k)).run{value: value}(data, upd) {
                ok = true;
            } catch {}
        } else {
            vm.prank(k);
            try plan.executeRound{value: value}(data, upd) {
                ok = true;
            } catch {}
        }
        _settle(ok, fee);
        _resetAdapter();
    }

    function warp(uint256 secs) external {
        skip(bound(secs, 0, 3 days));
    }

    function cancel(uint256 seed) external {
        address who = uint256(keccak256(abi.encode(seed))) % 150 == 0 ? owner : keepers[seed % keepers.length];
        uint256 before_ = owner.balance;
        vm.recordLogs();
        vm.prank(who);
        try plan.cancel() {
            successfulCalls++;
            if (who == owner) cancelled = true;
        } catch {}
        _trackSwept();
        ghostOwnerNative += owner.balance - before_;
    }

    function sweep(uint256 seed) external {
        address who = seed % 3 == 0 ? owner : keepers[seed % keepers.length];
        uint256 before_ = owner.balance;
        vm.recordLogs();
        vm.prank(who);
        try plan.sweep() {
            successfulCalls++;
        } catch {}
        _trackSwept();
        ghostOwnerNative += owner.balance - before_;
    }

    /// @dev cirBTC sent to the plan by mistake.
    function donateBtc(uint256 amt) external {
        amt = bound(amt, 1, 1e6);
        btc.mint(address(plan), amt);
        ghostDonatedBtc += amt;
    }

    function _trackSwept() internal {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == address(plan) && logs[i].topics[0] == DcaPlan.Swept.selector) {
                (uint256 n, uint256 b) = abi.decode(logs[i].data, (uint256, uint256));
                ghostSweptNative += n;
                ghostSweptBtc += b;
            }
        }
    }

    function forceValue(uint256 amt) external {
        amt = bound(amt, 1, 5e18);
        new ForceSender{value: amt}(payable(address(plan)));
        ghostForced += amt;
    }

    function setFee(uint256 fee) external {
        pyth.setFee(bound(fee, 0, 1e16));
    }

    // ───────────────── internals ─────────────────

    function _settle(bool ok, uint256 fee) internal {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        if (!ok) {
            protectedReverts++;
            return;
        }
        successfulCalls++;
        ghostRounds++;
        ghostFees += fee;
        bytes32 sig = DcaPlan.RoundExecuted.selector;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == address(plan) && logs[i].topics[0] == sig) {
                (, uint256 spent, uint256 got,,) = abi.decode(logs[i].data, (uint32, uint256, uint256, int64, address));
                ghostSpentUnits += spent;
                ghostBtc += got;
            }
        }
    }

    function _setAdapterMode(uint256 mode) internal {
        if (mode == 1) adapter.setPullOverride(true, amount / 2);
        else if (mode == 2) adapter.setSkipPull(true);
        else if (mode == 3) adapter.setRevertAll(true);
        else if (mode == 4) adapter.setDeliverTo(address(0xDEAD));
        else if (mode == 5) adapter.setReenter(MockAdapter.Reenter.ExecuteRound, false);
        else if (mode == 6) adapter.setReenter(MockAdapter.Reenter.Cancel, false);
        else if (mode == 7) adapter.setPullOverride(true, amount + 1);
    }

    function _resetAdapter() internal {
        adapter.setPullOverride(false, 0);
        adapter.setSkipPull(false);
        adapter.setRevertAll(false);
        adapter.setDeliverTo(address(0));
        adapter.setReenter(MockAdapter.Reenter.None, false);
    }
}

contract DcaPlanInvariantTest is DcaTestBase {
    DcaHandler internal h;

    function setUp() public override {
        super.setUp();
        h = new DcaHandler(plan, btc, pyth, adapter, owner);
        targetContract(address(h));
        bytes4[] memory sels = new bytes4[](10);
        sels[0] = DcaHandler.execute.selector;
        sels[1] = DcaHandler.warp.selector;
        sels[2] = DcaHandler.cancel.selector;
        sels[3] = DcaHandler.sweep.selector;
        sels[4] = DcaHandler.forceValue.selector;
        sels[5] = DcaHandler.setFee.selector;
        sels[6] = DcaHandler.execute.selector; // weight rounds and time higher than cancel
        sels[7] = DcaHandler.warp.selector;
        sels[8] = DcaHandler.execute.selector;
        sels[9] = DcaHandler.donateBtc.selector;
        targetSelector(FuzzSelector({addr: address(h), selectors: sels}));
    }

    /// @dev Total native value is conserved across plan, owner, keepers, Pyth, adapter and the handler,
    /// so no code path can send value anywhere else.
    function invariant_NativeValueConserved() public view {
        assertEq(h.totalNative(), h.startTotal());
    }

    /// @dev Deposit (+ forced value) is fully accounted for: owner received + keeper tips + USDC spent
    /// (now at the adapter) + plan balance. Pyth fees are paid by keepers' msg.value, never from the deposit.
    function invariant_DepositAccountedFor() public view {
        uint256 tips = h.ghostRounds() * TIP;
        uint256 spent = h.ghostSpentUnits() * 1e12;
        assertEq(h.ghostOwnerNative() + tips + spent + address(plan).balance, DEPOSIT + h.ghostForced());
    }

    function invariant_PythFeesMatchRounds() public view {
        assertEq(address(pyth).balance, h.ghostFees());
        assertEq(address(adapter).balance, h.ghostSpentUnits() * 1e12);
    }

    function invariant_KeeperNetIsTipsMinusFees() public view {
        assertEq(h.keeperNet(), int256(h.ghostRounds() * TIP) - int256(h.ghostFees()));
    }

    function invariant_OwnerNativeOnlyFromCancelOrSweep() public view {
        assertEq(owner.balance, h.ownerStart() + h.ghostOwnerNative());
    }

    /// @dev cirBTC conservation including donations: everything ever minted (bought + donated) sits with the
    /// owner or, if donated and not yet settled, in the plan. Bought cirBTC never stays in the plan.
    function invariant_CirBtcConserved() public view {
        uint256 total = h.ghostBtc() + h.ghostDonatedBtc();
        assertEq(btc.totalSupply(), total, "no cirBTC leaked or created");
        assertEq(btc.balanceOf(owner) + btc.balanceOf(address(plan)), total);
        assertGe(btc.balanceOf(owner), h.ghostBtc(), "every bought satoshi reached the owner");
        assertLe(btc.balanceOf(address(plan)), h.ghostDonatedBtc(), "only donations can be stranded");
        assertEq(btc.balanceOf(address(0xDEAD)), 0);
    }

    /// @dev Swept events report exactly what moved to the owner.
    function invariant_SweptAmountsAreExact() public view {
        assertEq(h.ghostSweptNative(), h.ghostOwnerNative());
    }

    /// @dev Settlement can only ever pay out donated cirBTC (bought cirBTC is forwarded by the round itself).
    function invariant_SweptBtcOnlyEverComesFromDonations() public view {
        assertLe(h.ghostSweptBtc(), h.ghostDonatedBtc());
    }

    function invariant_AllowanceAlwaysZero() public view {
        assertEq(usdc.allowance(address(plan), address(adapter)), 0);
    }

    function invariant_ScheduleConsistent() public view {
        assertEq(plan.nextDue(), T0 + h.ghostRounds() * INTERVAL);
        if (!h.cancelled()) {
            assertEq(uint256(plan.roundsLeft()) + h.ghostRounds(), ROUNDS);
        } else {
            assertEq(plan.roundsLeft(), 0);
        }
        assertLe(h.ghostRounds(), ROUNDS);
    }

    function invariant_PlanAlwaysCoversRemainingRounds() public view {
        assertGe(address(plan).balance, uint256(plan.roundsLeft()) * (uint256(AMOUNT) * 1e12 + TIP));
    }

    function invariant_ParametersImmutable() public view {
        assertEq(plan.owner(), owner);
        assertEq(plan.tipPerRound(), TIP);
        assertEq(plan.amountPerRound(), AMOUNT);
        assertEq(plan.intervalSecs(), INTERVAL);
        assertEq(plan.maxDeviationBps(), DEV);
    }
}
