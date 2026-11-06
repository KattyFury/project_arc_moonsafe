// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {VaultV2} from "../VaultV2.sol";
import {VaultFactoryV2} from "../VaultFactoryV2.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Rejects every native transfer.
contract RejectingRecipient {
    receive() external payable {
        revert("no");
    }
}

/// @dev Tries to re-enter withdraw when it receives funds.
contract ReenteringOwner {
    VaultV2 public vault;
    bytes public sig;
    uint256 public deadline;

    function create(VaultFactoryV2 f, address pwKey) external payable {
        vault = VaultV2(payable(f.createVault{value: msg.value}(pwKey)));
    }

    function fund() external payable {
        vault.deposit{value: msg.value}();
    }

    function arm(bytes calldata s, uint256 d) external {
        sig = s;
        deadline = d;
    }

    function go(uint256 amount) external {
        vault.withdraw(amount, payable(address(this)), deadline, sig);
    }

    receive() external payable {
        if (address(vault).balance > 0) vault.withdraw(1, payable(address(this)), deadline, sig);
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
    address internal pwKey; // address derived from the vault password
    uint256 internal pwSecret;

    uint256 internal constant FEE = 1 ether;
    uint256 internal constant FUND = 100 ether;

    function setUp() public virtual {
        (pwKey, pwSecret) = makeAddrAndKey("vault-password");
        impl = new VaultV2();
        factory = new VaultFactoryV2(address(impl), feeRecipient, FEE, safe);
        vm.deal(alice, 1_000 ether);
        vm.deal(thief, 1_000 ether);
        vm.deal(newWallet, 10 ether);
        vm.prank(alice);
        vault = VaultV2(payable(factory.createVault{value: FEE}(pwKey)));
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

    function _importSig(VaultV2 v, uint256 key, address newOwner, uint256 nonce_, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return _sign(
            v,
            key,
            keccak256(
                abi.encode(
                    keccak256("Import(address newOwner,uint256 nonce,uint256 deadline)"), newOwner, nonce_, deadline
                )
            )
        );
    }

    function _withdraw(uint256 amount, address to) internal {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, pwSecret, amount, to, vault.nonce(), deadline);
        vm.prank(alice);
        vault.withdraw(amount, payable(to), deadline, sig);
    }

    function _import(address who) internal {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _importSig(vault, pwSecret, who, vault.nonce(), deadline);
        vm.prank(who);
        vault.importVault(deadline, sig);
    }
}

contract VaultV2InitTest is VaultV2Base {
    function test_Init_OwnerPasswordKeyFactory() public view {
        assertEq(vault.owner(), alice);
        assertEq(vault.passwordKey(), pwKey);
        assertEq(vault.factory(), address(factory));
        assertEq(vault.nonce(), 0);
        assertEq(vault.getBalance(), FUND);
        assertEq(factory.getVault(alice), address(vault));
        assertTrue(factory.isVault(address(vault)));
    }

    function test_Init_CannotReinitialize() public {
        vm.expectRevert(VaultV2.AlreadyInitialized.selector);
        vault.initialize(thief, thief, thief);
    }

    function test_Init_ImplementationIsLocked() public {
        vm.expectRevert(VaultV2.AlreadyInitialized.selector);
        impl.initialize(thief, thief, thief);
    }

    function test_Init_ZeroPasswordKeyRejected() public {
        vm.prank(thief);
        vm.expectRevert(VaultV2.ZeroPasswordKey.selector);
        factory.createVault{value: FEE}(address(0));
    }

    function test_Init_RawCloneGuards() public {
        VaultV2 c = VaultV2(payable(Clones.clone(address(impl))));
        vm.expectRevert(VaultV2.ZeroOwner.selector);
        c.initialize(address(0), pwKey, address(factory));
        vm.expectRevert(VaultV2.ZeroFactory.selector);
        c.initialize(alice, pwKey, address(0));
    }

    function test_Deposit_OwnerAndGift() public {
        vm.prank(alice);
        vault.deposit{value: 1 ether}();
        vm.prank(thief);
        vault.depositFor{value: 2 ether}();
        assertEq(vault.getBalance(), FUND + 3 ether);
    }

    function test_Deposit_NonOwnerRevertsAndRawTransferRejected() public {
        vm.prank(thief);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.Unauthorized.selector, thief));
        vault.deposit{value: 1 ether}();
        vm.prank(alice);
        vm.expectRevert(VaultV2.ZeroAmount.selector);
        vault.deposit{value: 0}();
        vm.prank(thief);
        (bool ok,) = address(vault).call{value: 1 ether}("");
        assertFalse(ok);
    }
}

contract VaultV2WithdrawTest is VaultV2Base {
    function test_Withdraw_WalletPlusPassword() public {
        _withdraw(40 ether, dest);
        assertEq(dest.balance, 40 ether);
        assertEq(vault.getBalance(), FUND - 40 ether);
        assertEq(vault.nonce(), 1);
    }

    function test_Withdraw_ToAnyAddressIncludingOwner() public {
        uint256 before = alice.balance;
        _withdraw(FUND, alice);
        assertEq(alice.balance, before + FUND);
        assertEq(vault.getBalance(), 0);
    }

    function test_Withdraw_ReplayFails() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, pwSecret, 1 ether, dest, 0, deadline);
        vm.prank(alice);
        vault.withdraw(1 ether, dest, deadline, sig);
        vm.prank(alice);
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.withdraw(1 ether, dest, deadline, sig);
    }

    function test_Withdraw_SignatureBoundToAmountRecipientDeadline() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, pwSecret, 1 ether, dest, 0, deadline);
        vm.startPrank(alice);
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.withdraw(2 ether, dest, deadline, sig);
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.withdraw(1 ether, payable(thief), deadline, sig);
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.withdraw(1 ether, dest, deadline + 1, sig);
        vm.stopPrank();
    }

    function test_Withdraw_ExpiredSignature() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, pwSecret, 1 ether, dest, 0, deadline);
        vm.warp(deadline + 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.SignatureExpired.selector, deadline));
        vault.withdraw(1 ether, dest, deadline, sig);
    }

    function test_Withdraw_WrongPasswordFails() public {
        (, uint256 wrongKey) = makeAddrAndKey("guessed-password");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, wrongKey, 1 ether, dest, 0, deadline);
        vm.prank(alice);
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.withdraw(1 ether, dest, deadline, sig);
    }

    function test_Withdraw_WalletAloneCannot() public {
        vm.prank(alice);
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.withdraw(1 ether, dest, block.timestamp + 1, "");
    }

    function test_Withdraw_WalletSignatureIsNotPassword() public {
        (address wallet, uint256 walletKey) = makeAddrAndKey("owner-wallet");
        vm.deal(wallet, 10 ether);
        VaultFactoryV2 f = new VaultFactoryV2(address(impl), feeRecipient, 0, safe);
        vm.prank(wallet);
        VaultV2 v = VaultV2(payable(f.createVault(pwKey)));
        vm.prank(wallet);
        v.deposit{value: 5 ether}();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(v, walletKey, 1 ether, dest, 0, deadline);
        vm.prank(wallet);
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        v.withdraw(1 ether, dest, deadline, sig);
    }

    function test_Withdraw_PasswordAloneCannot() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, pwSecret, 1 ether, dest, 0, deadline);
        vm.prank(thief);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.Unauthorized.selector, thief));
        vault.withdraw(1 ether, dest, deadline, sig);
        vm.prank(pwKey);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.Unauthorized.selector, pwKey));
        vault.withdraw(1 ether, dest, deadline, sig);
    }

    function test_Withdraw_SignatureNotValidOnAnotherVault() public {
        address bob = makeAddr("bob");
        vm.deal(bob, 100 ether);
        vm.prank(bob);
        VaultV2 other = VaultV2(payable(factory.createVault{value: FEE}(pwKey))); // same password key on purpose
        vm.prank(bob);
        other.deposit{value: 10 ether}();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sigForAlice = _withdrawSig(vault, pwSecret, 1 ether, dest, 0, deadline);
        vm.prank(bob);
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        other.withdraw(1 ether, dest, deadline, sigForAlice);
    }

    function test_Withdraw_SignatureNotValidOnAnotherChain() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, pwSecret, 1 ether, dest, 0, deadline);
        vm.chainId(block.chainid + 1);
        vm.prank(alice);
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.withdraw(1 ether, dest, deadline, sig);
    }

    function test_Withdraw_MalformedSignatures() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, pwSecret, 1 ether, dest, 0, deadline);
        // High-s (malleated) form of a valid signature is rejected.
        bytes32 rr;
        bytes32 ss;
        uint8 vv;
        assembly {
            rr := mload(add(sig, 32))
            ss := mload(add(sig, 64))
            vv := byte(0, mload(add(sig, 96)))
        }
        uint256 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes memory malleated = abi.encodePacked(rr, bytes32(n - uint256(ss)), vv == 27 ? uint8(28) : uint8(27));
        vm.startPrank(alice);
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.withdraw(1 ether, dest, deadline, malleated);
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.withdraw(1 ether, dest, deadline, new bytes(65));
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.withdraw(1 ether, dest, deadline, hex"1234");
        vm.stopPrank();
    }

    function test_Withdraw_Guards() public {
        uint256 deadline = block.timestamp + 1 hours;
        vm.startPrank(alice);
        bytes memory s0 = _withdrawSig(vault, pwSecret, 0, dest, 0, deadline);
        vm.expectRevert(VaultV2.ZeroAmount.selector);
        vault.withdraw(0, dest, deadline, s0);
        bytes memory sz = _withdrawSig(vault, pwSecret, 1 ether, address(0), 0, deadline);
        vm.expectRevert(VaultV2.ZeroRecipient.selector);
        vault.withdraw(1 ether, payable(address(0)), deadline, sz);
        bytes memory sb = _withdrawSig(vault, pwSecret, FUND + 1, dest, 0, deadline);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.InsufficientBalance.selector, FUND + 1, FUND));
        vault.withdraw(FUND + 1, dest, deadline, sb);
        vm.stopPrank();
        assertEq(vault.nonce(), 0); // failed attempts consume nothing
    }

    function test_Withdraw_RecipientRejectsRevertsWholeTx() public {
        RejectingRecipient r = new RejectingRecipient();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, pwSecret, 1 ether, address(r), 0, deadline);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.NativeTransferFailed.selector, address(r), 1 ether));
        vault.withdraw(1 ether, payable(address(r)), deadline, sig);
        assertEq(vault.nonce(), 0);
        assertEq(vault.getBalance(), FUND);
    }

    function test_Withdraw_ReentrancyBlocked() public {
        ReenteringOwner ro = new ReenteringOwner();
        vm.deal(address(ro), 0);
        ro.create{value: FEE}(factory, pwKey);
        ro.fund{value: 5 ether}();
        VaultV2 v = ro.vault();
        uint256 deadline = block.timestamp + 1 hours;
        ro.arm(_withdrawSig(v, pwSecret, 1 ether, address(ro), 0, deadline), deadline);
        vm.expectRevert(); // inner re-entry fails, so the outer transfer fails
        ro.go(1 ether);
        assertEq(v.getBalance(), 5 ether);
    }
}

contract VaultV2ImportTest is VaultV2Base {
    function test_Import_NewWalletBecomesOwnerImmediately() public {
        _import(newWallet);
        assertEq(vault.owner(), newWallet);
        assertEq(vault.nonce(), 1);
        assertEq(factory.getVault(newWallet), address(vault));
        assertEq(factory.getVault(alice), address(0));
        assertFalse(factory.hasVault(alice));
    }

    function test_Import_NewOwnerCanWithdrawOldCannot() public {
        _import(newWallet);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, pwSecret, 10 ether, dest, vault.nonce(), deadline);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.Unauthorized.selector, alice));
        vault.withdraw(10 ether, dest, deadline, sig);
        vm.prank(newWallet);
        vault.withdraw(10 ether, dest, deadline, sig);
        assertEq(dest.balance, 10 ether);
    }

    function test_Import_OldWalletCanOpenAFreshVault() public {
        _import(newWallet);
        vm.prank(alice);
        address fresh = factory.createVault{value: FEE}(pwKey);
        assertEq(factory.getVault(alice), fresh);
    }

    function test_Import_SignatureBoundToCaller() public {
        // A thief who copies the import signature from the mempool cannot use it.
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _importSig(vault, pwSecret, newWallet, 0, deadline);
        vm.prank(thief);
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.importVault(deadline, sig);
        assertEq(vault.owner(), alice);
    }

    function test_Import_WithoutPasswordFails() public {
        (, uint256 wrongKey) = makeAddrAndKey("guess");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _importSig(vault, wrongKey, thief, 0, deadline);
        vm.prank(thief);
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.importVault(deadline, sig);
    }

    function test_Import_ReplayFails() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _importSig(vault, pwSecret, newWallet, 0, deadline);
        vm.prank(newWallet);
        vault.importVault(deadline, sig);
        // Move back to alice, then the old signature must not let newWallet take it again.
        _import(alice);
        vm.prank(newWallet);
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.importVault(deadline, sig);
    }

    function test_Import_Expired() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _importSig(vault, pwSecret, newWallet, 0, deadline);
        vm.warp(deadline + 1);
        vm.prank(newWallet);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.SignatureExpired.selector, deadline));
        vault.importVault(deadline, sig);
    }

    function test_Import_CurrentOwnerRejected() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _importSig(vault, pwSecret, alice, 0, deadline);
        vm.prank(alice);
        vm.expectRevert(VaultV2.AlreadyOwner.selector);
        vault.importVault(deadline, sig);
    }

    function test_Import_IntoWalletThatHasAVaultReverts() public {
        address bob = makeAddr("bob");
        vm.deal(bob, 10 ether);
        vm.prank(bob);
        address bobVault = factory.createVault{value: FEE}(pwKey);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _importSig(vault, pwSecret, bob, 0, deadline);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(VaultFactoryV2.VaultAlreadyExists.selector, bob, bobVault));
        vault.importVault(deadline, sig);
        assertEq(vault.owner(), alice);
        assertEq(vault.nonce(), 0);
    }

    function test_Import_InvalidatesUnusedWithdrawSignature() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory oldSig = _withdrawSig(vault, pwSecret, 5 ether, dest, 0, deadline);
        _import(newWallet);
        vm.prank(newWallet);
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.withdraw(5 ether, dest, deadline, oldSig);
    }
}

contract VaultV2FactoryTest is VaultV2Base {
    function test_Factory_OneVaultPerWalletAndFeeAccrues() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VaultFactoryV2.VaultAlreadyExists.selector, alice, address(vault)));
        factory.createVault{value: FEE}(pwKey);
        assertEq(factory.accruedFees(), FEE);
        factory.withdrawFees();
        assertEq(feeRecipient.balance, FEE);
    }

    function test_Factory_FeeOffAndRefund() public {
        vm.prank(safe);
        factory.setFee(0);
        address bob = makeAddr("bob");
        vm.deal(bob, 5 ether);
        vm.prank(bob);
        factory.createVault{value: 2 ether}(pwKey);
        assertEq(bob.balance, 5 ether); // everything refunded
    }

    function test_Factory_InsufficientFeeAndPause() public {
        address bob = makeAddr("bob");
        vm.deal(bob, 5 ether);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(VaultFactoryV2.InsufficientFee.selector, 0, FEE));
        factory.createVault(pwKey);
        vm.prank(safe);
        factory.setCreationPaused(true);
        vm.prank(bob);
        vm.expectRevert(VaultFactoryV2.CreationPaused.selector);
        factory.createVault{value: FEE}(pwKey);
    }

    function test_Factory_AdminOnlyAndBounded() public {
        vm.prank(thief);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, thief));
        factory.setFee(0);
        vm.prank(safe);
        vm.expectRevert(abi.encodeWithSelector(VaultFactoryV2.FeeTooHigh.selector, 11 ether, 10 ether));
        factory.setFee(11 ether);
        vm.prank(safe);
        vm.expectRevert(VaultFactoryV2.RenounceDisabled.selector);
        factory.renounceOwnership();
    }

    function test_Factory_ConstructorGuards() public {
        vm.expectRevert(abi.encodeWithSelector(VaultFactoryV2.InvalidImplementation.selector, address(0)));
        new VaultFactoryV2(address(0), feeRecipient, FEE, safe);
        vm.expectRevert(VaultFactoryV2.ZeroFeeRecipient.selector);
        new VaultFactoryV2(address(impl), payable(address(0)), FEE, safe);
        vm.expectRevert(abi.encodeWithSelector(VaultFactoryV2.FeeTooHigh.selector, 11 ether, 10 ether));
        new VaultFactoryV2(address(impl), feeRecipient, 11 ether, safe);
    }

    function test_Factory_OnlyItsVaultsCanReindex() public {
        vm.prank(thief);
        vm.expectRevert(abi.encodeWithSelector(VaultFactoryV2.NotAVault.selector, thief));
        factory.onOwnerChanged(alice, thief);
        // A vault made by another factory cannot touch this factory's index either.
        VaultFactoryV2 other = new VaultFactoryV2(address(impl), feeRecipient, 0, thief);
        vm.prank(thief);
        address foreign = other.createVault(pwKey);
        vm.prank(foreign);
        vm.expectRevert(abi.encodeWithSelector(VaultFactoryV2.NotAVault.selector, foreign));
        factory.onOwnerChanged(alice, thief);
        assertEq(factory.getVault(alice), address(vault));
    }

    function test_Factory_AdminHasNoPowerOverVaults() public {
        // The factory owner signs nothing the vault accepts and cannot become owner.
        vm.startPrank(safe);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.Unauthorized.selector, safe));
        vault.withdraw(1 ether, dest, block.timestamp + 1, "");
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.importVault(block.timestamp + 1, "");
        vm.stopPrank();
        assertEq(vault.getBalance(), FUND);
    }
}

contract VaultV2FuzzTest is VaultV2Base {
    function testFuzz_NoPasswordNeverMovesFunds(uint256 amount, address to, uint256 wrongSecret) public {
        wrongSecret = bound(wrongSecret, 1, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364140);
        vm.assume(wrongSecret != pwSecret);
        amount = bound(amount, 1, FUND);
        vm.assume(to != address(0) && to.code.length == 0);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, wrongSecret, amount, to, 0, deadline);
        vm.prank(alice);
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.withdraw(amount, payable(to), deadline, sig);
        assertEq(vault.getBalance(), FUND);
    }

    function testFuzz_StrangerWithPasswordSigButNoWalletCannotWithdraw(address stranger, uint256 amount) public {
        vm.assume(stranger != alice);
        amount = bound(amount, 1, FUND);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, pwSecret, amount, stranger, 0, deadline);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.Unauthorized.selector, stranger));
        vault.withdraw(amount, payable(stranger), deadline, sig);
        assertEq(vault.getBalance(), FUND);
    }

    function testFuzz_ImportSigForOneWalletUselessToAnother(address intended, address other) public {
        vm.assume(intended != other && intended != alice && other != alice);
        vm.assume(intended != address(0) && other != address(0));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _importSig(vault, pwSecret, intended, 0, deadline);
        vm.prank(other);
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.importVault(deadline, sig);
        assertEq(vault.owner(), alice);
    }

    function testFuzz_WithdrawExactAmounts(uint256 amount) public {
        amount = bound(amount, 1, FUND);
        _withdraw(amount, dest);
        assertEq(dest.balance, amount);
        assertEq(vault.getBalance(), FUND - amount);
    }
}
