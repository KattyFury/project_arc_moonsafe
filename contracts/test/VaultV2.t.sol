// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {VaultV2} from "../VaultV2.sol";
import {VaultFactoryV2} from "../VaultFactoryV2.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

/// @dev Rejects every native transfer.
contract RejectingRecipient {
    receive() external payable {
        revert("no");
    }
}

abstract contract VaultV2Base is Test {
    VaultV2 internal impl;
    VaultFactoryV2 internal factory;
    VaultV2 internal vault;

    address internal safe = makeAddr("safe");
    address payable internal feeRecipient = payable(makeAddr("feeRecipient"));
    address internal alice = makeAddr("alice"); // the vault owner (wallet)
    address internal thief = makeAddr("thief");
    address payable internal newWallet = payable(makeAddr("newWallet"));
    address payable internal dest = payable(makeAddr("dest"));
    address internal guardian;
    uint256 internal guardianKey;

    uint256 internal constant FEE = 1 ether;
    uint256 internal constant FUND = 100 ether;

    function setUp() public virtual {
        (guardian, guardianKey) = makeAddrAndKey("guardian");
        impl = new VaultV2();
        factory = new VaultFactoryV2(address(impl), guardian, feeRecipient, FEE, safe);
        vm.deal(alice, 1_000 ether);
        vm.deal(thief, 1_000 ether);
        vm.deal(guardian, 10 ether);
        vm.prank(alice);
        vault = VaultV2(payable(factory.createVault{value: FEE}()));
        vm.prank(alice);
        vault.deposit{value: FUND}();
    }

    function _domainSeparator(VaultV2 v) internal view returns (bytes32) {
        (, string memory name, string memory version, uint256 chainId, address verifying,,) = v.eip712Domain();
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                verifying
            )
        );
    }

    function _sign(VaultV2 v, uint256 key, bytes32 structHash) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(v), structHash));
        (uint8 vv, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, vv);
    }

    function _withdrawSig(VaultV2 v, uint256 key, uint256 amount, address to, uint256 nonce_, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return _sign(
            v,
            key,
            keccak256(
                abi.encode(
                    keccak256("Withdraw(uint256 amount,address to,uint256 nonce,uint256 deadline)"),
                    amount,
                    to,
                    nonce_,
                    deadline
                )
            )
        );
    }

    function _ownerSig(VaultV2 v, uint256 key, address newOwner, uint256 nonce_, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return _sign(
            v,
            key,
            keccak256(
                abi.encode(
                    keccak256("ChangeOwner(address newOwner,uint256 nonce,uint256 deadline)"),
                    newOwner,
                    nonce_,
                    deadline
                )
            )
        );
    }

    function _guardianWithdraw(uint256 amount, address to) internal {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, guardianKey, amount, to, vault.nonce(), deadline);
        vm.prank(alice);
        vault.withdraw(amount, payable(to), deadline, sig);
    }
}

contract VaultV2InitTest is VaultV2Base {
    function test_Init_OwnerGuardianFactory() public view {
        assertEq(vault.owner(), alice);
        assertEq(vault.guardian(), guardian);
        assertEq(factory.getVault(alice), address(vault));
        assertEq(vault.getBalance(), FUND);
        assertEq(vault.nonce(), 0);
    }

    function test_Init_CannotReinitialize() public {
        vm.expectRevert(VaultV2.AlreadyInitialized.selector);
        vault.initialize(thief, address(factory));
    }

    function test_Init_ImplementationIsLocked() public {
        vm.expectRevert(VaultV2.AlreadyInitialized.selector);
        impl.initialize(thief, address(factory));
    }

    function test_Init_FactoryRefusesGuardianAsCreator() public {
        vm.deal(guardian, 10 ether);
        vm.prank(guardian);
        vm.expectRevert(VaultFactoryV2.GuardianIsCreator.selector);
        factory.createVault{value: FEE}();
    }

    function test_Init_RevertsGuardianEqualsOwner() public {
        VaultV2 raw = VaultV2(payable(Clones.clone(address(impl))));
        vm.expectRevert(VaultV2.GuardianIsOwner.selector);
        raw.initialize(guardian, address(factory));
    }

    function test_Deposit_OwnerAndGift() public {
        vm.prank(alice);
        vault.deposit{value: 5 ether}();
        vm.prank(thief);
        vault.depositFor{value: 3 ether}();
        assertEq(vault.getBalance(), FUND + 8 ether);
    }

    function test_Deposit_NonOwnerRevertsAndRawTransferRejected() public {
        vm.prank(thief);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.Unauthorized.selector, thief));
        vault.deposit{value: 1 ether}();
        vm.prank(thief);
        (bool ok,) = address(vault).call{value: 1 ether}("");
        assertFalse(ok);
    }
}

contract VaultV2WithdrawTest is VaultV2Base {
    function test_Withdraw_BothKeys() public {
        _guardianWithdraw(10 ether, dest);
        assertEq(dest.balance, 10 ether);
        assertEq(vault.getBalance(), FUND - 10 ether);
        assertEq(vault.nonce(), 1);
    }

    function test_Withdraw_ReplayFails() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, guardianKey, 10 ether, dest, 0, deadline);
        vm.startPrank(alice);
        vault.withdraw(10 ether, dest, deadline, sig);
        vm.expectRevert(VaultV2.InvalidGuardianSignature.selector);
        vault.withdraw(10 ether, dest, deadline, sig);
        vm.stopPrank();
    }

    function test_Withdraw_SignatureBoundToAmountAndRecipient() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, guardianKey, 10 ether, dest, 0, deadline);
        vm.startPrank(alice);
        vm.expectRevert(VaultV2.InvalidGuardianSignature.selector);
        vault.withdraw(11 ether, dest, deadline, sig);
        vm.expectRevert(VaultV2.InvalidGuardianSignature.selector);
        vault.withdraw(10 ether, newWallet, deadline, sig);
        vm.expectRevert(VaultV2.InvalidGuardianSignature.selector);
        vault.withdraw(10 ether, dest, deadline + 1, sig);
        vm.stopPrank();
    }

    function test_Withdraw_ExpiredSignature() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, guardianKey, 10 ether, dest, 0, deadline);
        vm.warp(deadline + 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.SignatureExpired.selector, deadline));
        vault.withdraw(10 ether, dest, deadline, sig);
    }

    function test_Withdraw_WrongSignerFails() public {
        (, uint256 otherKey) = makeAddrAndKey("other");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, otherKey, 10 ether, dest, 0, deadline);
        vm.prank(alice);
        vm.expectRevert(VaultV2.InvalidGuardianSignature.selector);
        vault.withdraw(10 ether, dest, deadline, sig);
    }

    /// The thief holds the wallet only: no signature, no money.
    function test_Withdraw_WalletAloneCannot() public {
        vm.prank(alice);
        vm.expectRevert(VaultV2.InvalidGuardianSignature.selector);
        vault.withdraw(10 ether, dest, block.timestamp + 1 hours, hex"");
    }

    /// MoonSafe's key alone cannot move money either: the sender must be the owner.
    function test_Withdraw_GuardianAloneCannot() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, guardianKey, 10 ether, dest, 0, deadline);
        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.Unauthorized.selector, guardian));
        vault.withdraw(10 ether, dest, deadline, sig);
    }

    /// A valid signature in a thief's hands is useless without the owner wallet.
    function test_Withdraw_StolenSignatureUselessToThief() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, guardianKey, 10 ether, thief, 0, deadline);
        vm.prank(thief);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.Unauthorized.selector, thief));
        vault.withdraw(10 ether, payable(thief), deadline, sig);
    }

    function test_Withdraw_SignatureNotValidOnAnotherVault() public {
        address bob = makeAddr("bob");
        vm.deal(bob, 10 ether);
        vm.prank(bob);
        VaultV2 other = VaultV2(payable(factory.createVault{value: FEE}()));
        vm.prank(bob);
        other.deposit{value: 5 ether}();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, guardianKey, 1 ether, dest, 0, deadline); // signed for alice's vault
        vm.prank(bob);
        vm.expectRevert(VaultV2.InvalidGuardianSignature.selector);
        other.withdraw(1 ether, dest, deadline, sig);
    }

    function test_Withdraw_Guards() public {
        uint256 deadline = block.timestamp + 1 hours;
        // Signatures are made first: vm.sign is itself a call and would swallow expectRevert.
        bytes memory sigZero = _withdrawSig(vault, guardianKey, 0, dest, 0, deadline);
        bytes memory sigNoTo = _withdrawSig(vault, guardianKey, 1 ether, address(0), 0, deadline);
        bytes memory sigOver = _withdrawSig(vault, guardianKey, FUND + 1, dest, 0, deadline);
        vm.startPrank(alice);
        vm.expectRevert(VaultV2.ZeroAmount.selector);
        vault.withdraw(0, dest, deadline, sigZero);
        vm.expectRevert(VaultV2.ZeroRecipient.selector);
        vault.withdraw(1 ether, payable(address(0)), deadline, sigNoTo);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.InsufficientBalance.selector, FUND + 1, FUND));
        vault.withdraw(FUND + 1, dest, deadline, sigOver);
        vm.stopPrank();
    }

    function test_Withdraw_RotatedGuardianInvalidatesOldSigsAndNewKeyWorks() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory oldSig = _withdrawSig(vault, guardianKey, 1 ether, dest, 0, deadline);
        (address g2, uint256 key2) = makeAddrAndKey("guardian2");
        vm.prank(safe);
        factory.setGuardian(g2);
        vm.prank(alice);
        vm.expectRevert(VaultV2.InvalidGuardianSignature.selector);
        vault.withdraw(1 ether, dest, deadline, oldSig);
        bytes memory newSig = _withdrawSig(vault, key2, 1 ether, dest, 0, deadline);
        vm.prank(alice);
        vault.withdraw(1 ether, dest, deadline, newSig);
        assertEq(dest.balance, 1 ether);
    }

    function test_Withdraw_RecipientRejectsRevertsWholeTx() public {
        RejectingRecipient bad = new RejectingRecipient();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, guardianKey, 1 ether, address(bad), 0, deadline);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.NativeTransferFailed.selector, address(bad), 1 ether));
        vault.withdraw(1 ether, payable(address(bad)), deadline, sig);
        assertEq(vault.nonce(), 0); // the nonce did not burn
        assertEq(vault.getBalance(), FUND);
    }
}

contract VaultV2SlowWithdrawTest is VaultV2Base {
    function test_Slow_RequestWaitExecute() public {
        vm.prank(alice);
        vault.requestWithdraw(20 ether, dest);
        (address to, uint256 amount, uint256 eta) = vault.pendingWithdrawal();
        assertEq(to, dest);
        assertEq(amount, 20 ether);
        assertEq(eta, block.timestamp + 7 days);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.NotReady.selector, eta));
        vault.executeWithdraw();

        vm.warp(eta);
        vm.prank(alice);
        vault.executeWithdraw();
        assertEq(dest.balance, 20 ether);
        (,, uint256 etaAfter) = vault.pendingWithdrawal();
        assertEq(etaAfter, 0);
    }

    function test_Slow_OnlyOwnerRequestsAndExecutes() public {
        vm.prank(thief);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.Unauthorized.selector, thief));
        vault.requestWithdraw(1 ether, payable(thief));
        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.Unauthorized.selector, guardian));
        vault.requestWithdraw(1 ether, payable(guardian));

        vm.prank(alice);
        vault.requestWithdraw(1 ether, dest);
        vm.warp(block.timestamp + 7 days);
        vm.prank(thief);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.Unauthorized.selector, thief));
        vault.executeWithdraw();
    }

    /// The thief has the wallet. He starts a slow withdrawal; the real user clicks "not me" in the email.
    function test_Slow_GuardianCancelsThiefsRequest() public {
        vm.prank(alice); // the thief, acting with the stolen wallet
        vault.requestWithdraw(FUND, payable(thief));
        vm.prank(guardian);
        vault.cancelWithdraw();
        vm.warp(block.timestamp + 8 days);
        vm.prank(alice);
        vm.expectRevert(VaultV2.NothingPending.selector);
        vault.executeWithdraw();
        assertEq(vault.getBalance(), FUND);
    }

    function test_Slow_OwnerCanCancelOwnRequest() public {
        vm.startPrank(alice);
        vault.requestWithdraw(1 ether, dest);
        vault.cancelWithdraw();
        vm.stopPrank();
        (,, uint256 eta) = vault.pendingWithdrawal();
        assertEq(eta, 0);
    }

    function test_Slow_StrangerCannotCancel() public {
        vm.prank(alice);
        vault.requestWithdraw(1 ether, dest);
        vm.prank(thief);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.Unauthorized.selector, thief));
        vault.cancelWithdraw();
    }

    function test_Slow_NothingToCancel() public {
        vm.prank(guardian);
        vm.expectRevert(VaultV2.NothingPending.selector);
        vault.cancelWithdraw();
    }

    function test_Slow_SecondRequestBlockedWhileLive() public {
        vm.startPrank(alice);
        vault.requestWithdraw(1 ether, dest);
        vm.expectRevert(VaultV2.WithdrawalPending.selector);
        vault.requestWithdraw(2 ether, dest);
        vm.stopPrank();
    }

    function test_Slow_ExpiresAndCanBeReplaced() public {
        vm.prank(alice);
        vault.requestWithdraw(1 ether, dest);
        (,, uint256 eta) = vault.pendingWithdrawal();
        vm.warp(eta + 14 days + 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.RequestExpired.selector, eta + 14 days));
        vault.executeWithdraw();
        vm.prank(alice);
        vault.requestWithdraw(2 ether, dest); // stale one is replaceable
        (, uint256 amount,) = vault.pendingWithdrawal();
        assertEq(amount, 2 ether);
    }

    function test_Slow_LastSecondOfGraceStillWorks() public {
        vm.prank(alice);
        vault.requestWithdraw(1 ether, dest);
        (,, uint256 eta) = vault.pendingWithdrawal();
        vm.warp(eta + 14 days);
        vm.prank(alice);
        vault.executeWithdraw();
        assertEq(dest.balance, 1 ether);
    }

    function test_Slow_ShortfallAtExecuteReverts() public {
        vm.prank(alice);
        vault.requestWithdraw(FUND, dest);
        _guardianWithdraw(10 ether, newWallet); // balance drops meanwhile
        (,, uint256 eta) = vault.pendingWithdrawal();
        vm.warp(eta);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.InsufficientBalance.selector, FUND, FUND - 10 ether));
        vault.executeWithdraw();
    }
}

contract VaultV2OwnerChangeTest is VaultV2Base {
    /// Lost wallet: the server (guardian key) starts it, nobody cancels, anyone finishes.
    function test_OwnerChange_LostWalletFlow() public {
        vm.prank(guardian);
        vault.requestOwnerChange(newWallet);
        (address pendingOwner, uint256 eta) = vault.pendingOwnerChange();
        assertEq(pendingOwner, newWallet);
        assertEq(eta, block.timestamp + 7 days);

        vm.expectRevert(abi.encodeWithSelector(VaultV2.NotReady.selector, eta));
        vault.finishOwnerChange();

        vm.warp(eta);
        vm.prank(makeAddr("anyone"));
        vault.finishOwnerChange();
        assertEq(vault.owner(), newWallet);

        // The new wallet runs the vault; the old one is out.
        _guardianWithdrawAs(newWallet, 5 ether, dest);
        assertEq(dest.balance, 5 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.Unauthorized.selector, alice));
        vault.requestWithdraw(1 ether, dest);
    }

    function _guardianWithdrawAs(address who, uint256 amount, address to) internal {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, guardianKey, amount, to, vault.nonce(), deadline);
        vm.prank(who);
        vault.withdraw(amount, payable(to), deadline, sig);
    }

    function test_OwnerChange_OnlyGuardianStarts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.Unauthorized.selector, alice));
        vault.requestOwnerChange(newWallet);
        vm.prank(thief);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.Unauthorized.selector, thief));
        vault.requestOwnerChange(thief);
    }

    /// Server key leaks: the attacker starts a takeover; the real owner cancels inside the delay.
    function test_OwnerChange_OwnerCancelsStolenGuardianRequest() public {
        vm.prank(guardian); // attacker with the guardian key
        vault.requestOwnerChange(thief);
        vm.prank(alice);
        vault.cancelOwnerChange();
        vm.warp(block.timestamp + 8 days);
        vm.expectRevert(VaultV2.NothingPending.selector);
        vault.finishOwnerChange();
        assertEq(vault.owner(), alice);
    }

    function test_OwnerChange_GuardianCanCancelToo() public {
        vm.startPrank(guardian);
        vault.requestOwnerChange(newWallet);
        vault.cancelOwnerChange();
        vm.stopPrank();
        (, uint256 eta) = vault.pendingOwnerChange();
        assertEq(eta, 0);
    }

    function test_OwnerChange_StrangerCannotCancel() public {
        vm.prank(guardian);
        vault.requestOwnerChange(newWallet);
        vm.prank(thief);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.Unauthorized.selector, thief));
        vault.cancelOwnerChange();
    }

    function test_OwnerChange_InvalidTargets() public {
        vm.startPrank(guardian);
        vm.expectRevert(VaultV2.ZeroOwner.selector);
        vault.requestOwnerChange(address(0));
        vm.expectRevert(abi.encodeWithSelector(VaultV2.InvalidNewOwner.selector, alice));
        vault.requestOwnerChange(alice);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.InvalidNewOwner.selector, guardian));
        vault.requestOwnerChange(guardian);
        vm.stopPrank();
    }

    function test_OwnerChange_ExpiresAfterGrace() public {
        vm.prank(guardian);
        vault.requestOwnerChange(newWallet);
        (, uint256 eta) = vault.pendingOwnerChange();
        vm.warp(eta + 14 days + 1);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.RequestExpired.selector, eta + 14 days));
        vault.finishOwnerChange();
        vm.prank(guardian);
        vault.requestOwnerChange(newWallet); // can start again
    }

    function test_OwnerChange_SecondRequestBlockedWhileLive() public {
        vm.startPrank(guardian);
        vault.requestOwnerChange(newWallet);
        vm.expectRevert(VaultV2.OwnerChangePending.selector);
        vault.requestOwnerChange(makeAddr("another"));
        vm.stopPrank();
    }

    function test_OwnerChange_OldOwnerKeepsWorkingDuringWait() public {
        vm.prank(guardian);
        vault.requestOwnerChange(newWallet);
        vm.prank(alice);
        vault.deposit{value: 1 ether}();
        _guardianWithdraw(1 ether, dest);
        assertEq(dest.balance, 1 ether);
    }

    function test_OwnerChange_ClearsOldOwnersPendingWithdrawal() public {
        vm.prank(alice);
        vault.requestWithdraw(50 ether, payable(thief));
        vm.prank(guardian);
        vault.requestOwnerChange(newWallet);
        vm.warp(block.timestamp + 7 days);
        vault.finishOwnerChange();
        (,, uint256 eta) = vault.pendingWithdrawal();
        assertEq(eta, 0);
    }

    function test_OwnerChange_FinishRefusedIfTargetBecameGuardian() public {
        vm.prank(guardian);
        vault.requestOwnerChange(newWallet);
        vm.prank(safe);
        factory.setGuardian(newWallet); // the factory rotates the guardian onto the pending owner
        vm.warp(block.timestamp + 7 days);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.InvalidNewOwner.selector, newWallet));
        vault.finishOwnerChange();
    }

    function test_ChangeOwner_ImmediateWithBothKeys() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _ownerSig(vault, guardianKey, newWallet, 0, deadline);
        vm.prank(alice);
        vault.changeOwner(newWallet, deadline, sig);
        assertEq(vault.owner(), newWallet);
        assertEq(vault.nonce(), 1); // ownership change advances it, so the signature cannot be reused
    }

    function test_ChangeOwner_WalletAloneCannot() public {
        vm.prank(alice);
        vm.expectRevert(VaultV2.InvalidGuardianSignature.selector);
        vault.changeOwner(thief, block.timestamp + 1 hours, hex"");
    }

    function test_ChangeOwner_SignatureBoundToTarget() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _ownerSig(vault, guardianKey, newWallet, 0, deadline);
        vm.prank(alice);
        vm.expectRevert(VaultV2.InvalidGuardianSignature.selector);
        vault.changeOwner(thief, deadline, sig);
    }

    function test_ChangeOwner_UnusedWithdrawSigDiesWithOldOwner() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory wSig = _withdrawSig(vault, guardianKey, 10 ether, dest, 0, deadline);
        bytes memory oSig = _ownerSig(vault, guardianKey, newWallet, 0, deadline);
        vm.prank(alice);
        vault.changeOwner(newWallet, deadline, oSig);
        vm.prank(newWallet);
        vm.expectRevert(VaultV2.InvalidGuardianSignature.selector);
        vault.withdraw(10 ether, dest, deadline, wSig);
    }

    function test_ChangeOwner_Guards() public {
        uint256 deadline = block.timestamp + 1 hours;
        vm.startPrank(alice);
        vm.expectRevert(VaultV2.ZeroOwner.selector);
        vault.changeOwner(address(0), deadline, hex"");
        vm.expectRevert(abi.encodeWithSelector(VaultV2.InvalidNewOwner.selector, guardian));
        vault.changeOwner(guardian, deadline, hex"");
        vm.expectRevert(abi.encodeWithSelector(VaultV2.InvalidNewOwner.selector, alice));
        vault.changeOwner(alice, deadline, hex"");
        vm.stopPrank();
    }
}

contract VaultV2FactoryTest is VaultV2Base {
    function test_Factory_GuardianAdminOnlyAndNonzero() public {
        vm.prank(thief);
        vm.expectRevert();
        factory.setGuardian(thief);
        vm.prank(safe);
        vm.expectRevert(VaultFactoryV2.ZeroGuardian.selector);
        factory.setGuardian(address(0));
    }

    function test_Factory_ConstructorGuards() public {
        vm.expectRevert(VaultFactoryV2.ZeroGuardian.selector);
        new VaultFactoryV2(address(impl), address(0), feeRecipient, FEE, safe);
        vm.expectRevert(abi.encodeWithSelector(VaultFactoryV2.InvalidImplementation.selector, address(0)));
        new VaultFactoryV2(address(0), guardian, feeRecipient, FEE, safe);
    }

    function test_Factory_OneVaultPerWalletAndFeeAccrues() public {
        assertEq(factory.accruedFees(), FEE);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VaultFactoryV2.VaultAlreadyExists.selector, alice, address(vault)));
        factory.createVault{value: FEE}();
        factory.withdrawFees();
        assertEq(feeRecipient.balance, FEE);
    }

    /// Rotating the guardian is not a way to take funds: the factory admin gains no spending power.
    function test_Factory_AdminRotationCannotMoveFunds() public {
        (address g2,) = makeAddrAndKey("guardian2");
        vm.prank(safe);
        factory.setGuardian(g2);
        vm.prank(safe);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.Unauthorized.selector, safe));
        vault.requestWithdraw(1 ether, payable(safe));
        assertEq(vault.getBalance(), FUND);
    }
}

/// Property tests: no sequence of actions by anyone lacking the owner wallet loses money.
contract VaultV2FuzzTest is VaultV2Base {
    function testFuzz_GuardianAloneNeverMovesFunds(uint256 amount, address to, uint256 warpBy) public {
        warpBy = bound(warpBy, 0, 60 days);
        vm.startPrank(guardian);
        vm.expectRevert();
        vault.withdraw(amount, payable(to), block.timestamp + 1 hours, hex"");
        vm.expectRevert();
        vault.requestWithdraw(amount, payable(to));
        vm.expectRevert();
        vault.executeWithdraw();
        vm.stopPrank();
        vm.warp(block.timestamp + warpBy);
        assertEq(vault.getBalance(), FUND);
    }

    function testFuzz_OwnerAloneNeverMovesFundsInstantly(uint256 amount, address to, bytes calldata junkSig) public {
        amount = bound(amount, 1, FUND);
        vm.assume(to != address(0));
        vm.prank(alice);
        vm.expectRevert();
        vault.withdraw(amount, payable(to), block.timestamp + 1 hours, junkSig);
        assertEq(vault.getBalance(), FUND);
    }

    function testFuzz_StrangerCannotTouchAnything(address stranger, uint256 amount) public {
        vm.assume(stranger != alice && stranger != guardian && stranger != address(factory));
        vm.startPrank(stranger);
        vm.expectRevert();
        vault.requestWithdraw(amount, payable(stranger));
        vm.expectRevert();
        vault.executeWithdraw();
        vm.expectRevert();
        vault.cancelWithdraw();
        vm.expectRevert();
        vault.requestOwnerChange(stranger);
        vm.expectRevert();
        vault.cancelOwnerChange();
        vm.expectRevert();
        vault.changeOwner(stranger, block.timestamp + 1 hours, hex"");
        vm.stopPrank();
        assertEq(vault.getBalance(), FUND);
        assertEq(vault.owner(), alice);
    }

    function testFuzz_SlowWithdrawNeverEarly(uint256 elapsed) public {
        elapsed = bound(elapsed, 0, 7 days - 1);
        vm.prank(alice);
        vault.requestWithdraw(1 ether, dest);
        vm.warp(block.timestamp + elapsed);
        vm.prank(alice);
        vm.expectRevert();
        vault.executeWithdraw();
        assertEq(dest.balance, 0);
    }
}
