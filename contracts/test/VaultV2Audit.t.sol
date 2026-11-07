// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {VaultV2} from "../VaultV2.sol";
import {VaultFactoryV2} from "../VaultFactoryV2.sol";
import {VaultV2Base, RejectingRecipient} from "./VaultV2.t.sol";

/// @dev Calls createVault with excess value and tries to re-enter the factory from the refund.
contract RefundReenter {
    VaultFactoryV2 internal f;
    uint8 internal mode;

    constructor(VaultFactoryV2 f_) {
        f = f_;
    }

    function go(address pk, uint8 m) external payable {
        mode = m;
        f.createVault{value: msg.value}(pk);
    }

    receive() external payable {
        if (mode == 1) f.withdrawFees();
        if (mode == 2) f.createVault(address(0xBEEF));
    }
}

/// @dev A contract wallet that can import a vault.
contract ContractWallet {
    function doImport(VaultV2 v, uint256 deadline, bytes calldata sig) external {
        v.importVault(deadline, sig);
    }

    function doWithdraw(VaultV2 v, uint256 amount, address payable to, uint256 deadline, bytes calldata sig) external {
        v.withdraw(amount, to, deadline, sig);
    }

    receive() external payable {}
}

/// @notice Audit regression tests: signature scheme, clone domain, index integrity, fee accounting, admin powers.
contract VaultV2AuditTest is VaultV2Base {
    uint256 internal constant SECP_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    function _rsv(VaultV2 v, uint256 key, bytes32 structHash) internal view returns (uint8, bytes32, bytes32) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(v), structHash));
        (uint8 vv, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return (vv, r, s);
    }

    function _withdrawStruct(uint256 amount, address to, uint256 n, uint256 deadline) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("Withdraw(uint256 amount,address to,uint256 nonce,uint256 deadline)"),
                amount,
                to,
                n,
                deadline
            )
        );
    }

    // ───────────── EIP-712 domain on clones ─────────────

    function test_Domain_BoundToCloneNotImplementation() public {
        (, string memory name, string memory version, uint256 chainId, address vc,,) = vault.eip712Domain();
        assertEq(name, "MoonSafeVault");
        assertEq(version, "2");
        assertEq(chainId, block.chainid);
        assertEq(vc, address(vault));
        (,,,, address implVc,,) = impl.eip712Domain();
        assertEq(implVc, address(impl));
        assertTrue(_domainSeparator(vault) != _domainSeparator(impl));
    }

    function test_Domain_EachCloneHasItsOwnSeparator() public {
        address bob = makeAddr("bob");
        vm.deal(bob, 10 ether);
        vm.prank(bob);
        VaultV2 other = VaultV2(payable(factory.createVault{value: FEE}(pwKey)));
        assertTrue(_domainSeparator(vault) != _domainSeparator(other));
    }

    function test_Domain_FollowsChainId() public {
        vm.chainId(5042);
        _withdraw(1 ether, dest); // signed with the live domain, so it verifies
        assertEq(dest.balance, 1 ether);
    }

    function test_Import_SignatureNotValidOnAnotherVaultOrChain() public {
        address bob = makeAddr("bob");
        vm.deal(bob, 10 ether);
        vm.prank(bob);
        VaultV2 other = VaultV2(payable(factory.createVault{value: FEE}(pwKey))); // same password key on purpose
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _importSig(vault, pwSecret, newWallet, 0, deadline);
        vm.prank(newWallet);
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        other.importVault(deadline, sig);
        vm.chainId(block.chainid + 1);
        vm.prank(newWallet);
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.importVault(deadline, sig);
    }

    function test_Impl_CannotBeTakenOrDrained() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _importSig(impl, pwSecret, thief, 0, deadline);
        vm.startPrank(thief);
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        impl.importVault(deadline, sig);
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        impl.importVault(deadline, new bytes(65)); // ecrecover returns zero: must not match the zero password key
        vm.expectRevert(abi.encodeWithSelector(VaultV2.Unauthorized.selector, thief));
        impl.withdraw(1, dest, deadline, sig);
        vm.stopPrank();
        assertEq(impl.owner(), address(0));
    }

    // ───────────── Signature encoding, malleability, deadline ─────────────

    function test_Sig_OnlyCanonical65ByteForm() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _rsv(vault, pwSecret, _withdrawStruct(1 ether, dest, 0, deadline));
        bytes32 vs = bytes32(uint256(s) | (uint256(v - 27) << 255));
        vm.startPrank(alice);
        // ERC-2098 compact form
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.withdraw(1 ether, dest, deadline, abi.encodePacked(r, vs));
        // v in {0,1}
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.withdraw(1 ether, dest, deadline, abi.encodePacked(r, s, uint8(v - 27)));
        // trailing byte
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.withdraw(1 ether, dest, deadline, abi.encodePacked(r, s, v, uint8(0)));
        // high-s twin of a valid signature
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.withdraw(1 ether, dest, deadline, abi.encodePacked(r, bytes32(SECP_N - uint256(s)), v == 27 ? 28 : 27));
        // the canonical form still works afterwards (nothing was consumed)
        vault.withdraw(1 ether, dest, deadline, abi.encodePacked(r, s, v));
        vm.stopPrank();
        assertEq(dest.balance, 1 ether);
    }

    function test_Deadline_InclusiveBoundary() public {
        uint256 deadline = block.timestamp; // valid in this very second
        bytes memory sig = _withdrawSig(vault, pwSecret, 1 ether, dest, 0, deadline);
        vm.prank(alice);
        vault.withdraw(1 ether, dest, deadline, sig);
        bytes memory sig2 = _withdrawSig(vault, pwSecret, 1 ether, dest, 1, deadline);
        vm.warp(block.timestamp + 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.SignatureExpired.selector, deadline));
        vault.withdraw(1 ether, dest, deadline, sig2);
    }

    // ───────────── Front-running and nonce griefing ─────────────

    function test_Import_CopiedSignatureFromMempoolIsUselessAndLegitImportStillLands() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _importSig(vault, pwSecret, newWallet, 0, deadline);
        vm.prank(thief); // front-runner replays the exact calldata
        vm.expectRevert(VaultV2.InvalidPasswordSignature.selector);
        vault.importVault(deadline, sig);
        assertEq(vault.nonce(), 0); // nothing consumed
        vm.prank(newWallet);
        vault.importVault(deadline, sig);
        assertEq(vault.owner(), newWallet);
        assertEq(factory.getVault(newWallet), address(vault));
    }

    function test_Withdraw_CopiedCalldataFromMempoolIsUseless() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, pwSecret, 5 ether, dest, 0, deadline);
        vm.prank(thief);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.Unauthorized.selector, thief));
        vault.withdraw(5 ether, dest, deadline, sig);
        vm.prank(alice);
        vault.withdraw(5 ether, dest, deadline, sig);
        assertEq(dest.balance, 5 ether);
    }

    function testFuzz_NobodyWithoutPasswordCanAdvanceNonceOrChangeOwner(
        address caller,
        uint256 deadline,
        bytes calldata sig
    ) public {
        vm.startPrank(caller);
        try vault.importVault(deadline, sig) {
            fail();
        } catch {}
        try vault.withdraw(1, dest, deadline, sig) {
            fail();
        } catch {}
        vm.stopPrank();
        assertEq(vault.nonce(), 0);
        assertEq(vault.owner(), alice);
        assertEq(vault.getBalance(), FUND);
    }

    function test_ContractWalletCanImportAndWithdraw() public {
        ContractWallet w = new ContractWallet();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _importSig(vault, pwSecret, address(w), 0, deadline);
        w.doImport(vault, deadline, sig);
        assertEq(vault.owner(), address(w));
        assertEq(factory.getVault(address(w)), address(vault));
        bytes memory wsig = _withdrawSig(vault, pwSecret, 3 ether, address(w), 1, deadline);
        w.doWithdraw(vault, 3 ether, payable(address(w)), deadline, wsig);
        assertEq(address(w).balance, 3 ether);
    }

    // ───────────── Native-transfer edge cases ─────────────

    function test_Native_ForcedValueInVaultIsWithdrawable() public {
        vm.deal(address(vault), FUND + 7 ether);
        _withdraw(FUND + 7 ether, dest);
        assertEq(dest.balance, FUND + 7 ether);
        assertEq(vault.getBalance(), 0);
    }

    function test_Native_BlockedRecipientDoesNotConsumeNonceAndOtherRecipientWorks() public {
        RejectingRecipient blocked = new RejectingRecipient(); // stands in for a Circle-blocklisted address
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory bad = _withdrawSig(vault, pwSecret, 10 ether, address(blocked), 0, deadline);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.NativeTransferFailed.selector, address(blocked), 10 ether));
        vault.withdraw(10 ether, payable(address(blocked)), deadline, bad);
        assertEq(vault.nonce(), 0);
        _withdraw(10 ether, dest); // user re-signs for a different destination; funds were never at risk
        assertEq(dest.balance, 10 ether);
    }

    function test_Native_WithdrawToVaultItselfFailsCleanly() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _withdrawSig(vault, pwSecret, 1 ether, address(vault), 0, deadline);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.NativeTransferFailed.selector, address(vault), 1 ether));
        vault.withdraw(1 ether, payable(address(vault)), deadline, sig);
        assertEq(vault.getBalance(), FUND);
    }

    // ───────────── Factory index integrity ─────────────

    function test_Index_UnregisteredCloneCannotTouchIndex() public {
        VaultV2 raw = VaultV2(payable(Clones.clone(address(impl))));
        (address k, uint256 ks) = makeAddrAndKey("raw-key");
        raw.initialize(thief, k, address(factory)); // anyone may initialize their own raw clone
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _importSig(raw, ks, newWallet, 0, deadline);
        vm.prank(newWallet);
        vm.expectRevert(abi.encodeWithSelector(VaultFactoryV2.NotAVault.selector, address(raw)));
        raw.importVault(deadline, sig);
        assertFalse(factory.isVault(address(raw)));
        assertEq(factory.getVault(alice), address(vault));
        assertEq(factory.getVault(newWallet), address(0));
    }

    function test_Index_ThirdPartyCannotBlockVictimsImportOrCreation() public {
        // Nothing a third party can do makes getVault(newWallet) non-zero or consumes the nonce.
        vm.prank(thief);
        factory.createVault{value: FEE}(makeAddr("thiefKey"));
        _import(newWallet);
        assertEq(factory.getVault(newWallet), address(vault));
        // And the victim's old wallet is not blocked from opening a fresh vault afterwards.
        vm.prank(alice);
        factory.createVault{value: FEE}(pwKey);
    }

    function test_Index_ImportBackToOldWalletAfterMove() public {
        _import(newWallet);
        _import(alice);
        assertEq(factory.getVault(alice), address(vault));
        assertEq(factory.getVault(newWallet), address(0));
    }

    // ───────────── Fee accounting ─────────────

    function testFuzz_Fee_ExactAccountingAndRefund(uint256 newFee, uint256 sent) public {
        newFee = bound(newFee, 0, factory.MAX_FEE());
        sent = bound(sent, newFee, 100 ether);
        vm.prank(safe);
        factory.setFee(newFee);
        address bob = makeAddr("bob");
        vm.deal(bob, 100 ether);
        vm.prank(bob);
        factory.createVault{value: sent}(pwKey);
        assertEq(bob.balance, 100 ether - newFee);
        assertEq(factory.accruedFees(), FEE + newFee);
        assertEq(address(factory).balance, FEE + newFee);
    }

    function test_Fee_RaisedBeforeInclusionRevertsWithoutLoss() public {
        address bob = makeAddr("bob");
        vm.deal(bob, 5 ether);
        vm.prank(safe);
        factory.setFee(5 ether);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(VaultFactoryV2.InsufficientFee.selector, FEE, 5 ether));
        factory.createVault{value: FEE}(pwKey);
        assertEq(bob.balance, 5 ether);
        assertFalse(factory.hasVault(bob));
    }

    function test_Fee_ForcedFactoryValueIsNotAccruedAndNotWithdrawable() public {
        vm.deal(address(factory), address(factory).balance + 5 ether);
        factory.withdrawFees();
        assertEq(feeRecipient.balance, FEE);
        assertEq(address(factory).balance, 5 ether);
        assertEq(factory.accruedFees(), 0);
        vm.expectRevert(VaultFactoryV2.NoFeesAccrued.selector);
        factory.withdrawFees();
    }

    function test_Fee_RefundReentrancyIsBlockedAndRevertsWholeCreation() public {
        RefundReenter r = new RefundReenter(factory);
        vm.deal(address(r), 10 ether);
        for (uint8 m = 1; m <= 2; m++) {
            vm.expectRevert(abi.encodeWithSelector(VaultFactoryV2.RefundFailed.selector, address(r), 1 ether));
            r.go{value: FEE + 1 ether}(pwKey, m);
            assertFalse(factory.hasVault(address(r)));
            assertEq(factory.accruedFees(), FEE);
        }
    }

    function test_Fee_RejectingRecipientKeepsFeesAndAdminCanReplace() public {
        RejectingRecipient bad = new RejectingRecipient();
        vm.prank(safe);
        factory.setFeeRecipient(payable(address(bad)));
        vm.expectRevert(abi.encodeWithSelector(VaultFactoryV2.WithdrawFeesFailed.selector, address(bad), FEE));
        factory.withdrawFees();
        assertEq(factory.accruedFees(), FEE);
        // creation and import are unaffected by a broken recipient
        address bob = makeAddr("bob");
        vm.deal(bob, 5 ether);
        vm.prank(bob);
        factory.createVault{value: FEE}(pwKey);
        _import(newWallet);
        vm.prank(safe);
        factory.setFeeRecipient(feeRecipient);
        factory.withdrawFees();
        assertEq(feeRecipient.balance, 2 * FEE);
    }

    // ───────────── Factory owner has no path to a vault ─────────────

    function test_Admin_PauseDoesNotAffectExistingVaults() public {
        vm.prank(safe);
        factory.setCreationPaused(true);
        _withdraw(1 ether, dest);
        _import(newWallet);
        assertEq(factory.getVault(newWallet), address(vault));
    }

    function test_Admin_OwnershipTransferDoesNotTouchVaults() public {
        address newAdmin = makeAddr("newAdmin");
        vm.prank(safe);
        factory.transferOwnership(newAdmin);
        vm.prank(newAdmin);
        factory.acceptOwnership();
        assertEq(vault.owner(), alice);
        assertEq(vault.passwordKey(), pwKey);
        assertEq(vault.getBalance(), FUND);
        vm.startPrank(newAdmin);
        vm.expectRevert(VaultV2.AlreadyInitialized.selector);
        vault.initialize(newAdmin, newAdmin, newAdmin);
        vm.expectRevert(abi.encodeWithSelector(VaultV2.Unauthorized.selector, newAdmin));
        vault.deposit{value: 0}();
        vm.stopPrank();
    }

    function test_Admin_CannotCallIndexCallbackDirectly() public {
        vm.prank(safe);
        vm.expectRevert(abi.encodeWithSelector(VaultFactoryV2.NotAVault.selector, safe));
        factory.onOwnerChanged(alice, safe);
        assertEq(factory.getVault(alice), address(vault));
    }
}

/// @notice Stateful fuzzing of the factory owner-to-vault index across creates and imports.
contract IndexHandler is Test {
    bytes32 private constant IMPORT_TYPEHASH = keccak256("Import(address newOwner,uint256 nonce,uint256 deadline)");
    uint256 public constant N = 5;

    VaultFactoryV2 public factory;
    address[5] public actors;
    VaultV2[] public vaults;
    uint256[] public secrets;
    uint256 public imports;

    constructor(VaultFactoryV2 f) {
        factory = f;
        for (uint256 i = 0; i < N; i++) {
            actors[i] = address(uint160(0xA000 + i));
            vm.deal(actors[i], 1_000 ether);
        }
    }

    function vaultCount() external view returns (uint256) {
        return vaults.length;
    }

    function create(uint256 a, uint256 keySeed) external {
        address actor = actors[bound(a, 0, N - 1)];
        if (factory.hasVault(actor)) return;
        uint256 sk = bound(keySeed, 1, 1e30);
        uint256 fee = factory.fee();
        vm.prank(actor);
        address v = factory.createVault{value: fee}(vm.addr(sk));
        vaults.push(VaultV2(payable(v)));
        secrets.push(sk);
    }

    function importTo(uint256 vi, uint256 a) external {
        if (vaults.length == 0) return;
        vi = bound(vi, 0, vaults.length - 1);
        VaultV2 v = vaults[vi];
        address actor = actors[bound(a, 0, N - 1)];
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(v, secrets[vi], keccak256(abi.encode(IMPORT_TYPEHASH, actor, v.nonce(), deadline)));
        vm.prank(actor);
        try v.importVault(deadline, sig) {
            imports++;
        } catch {}
    }

    function _domain(VaultV2 v) private view returns (bytes32) {
        (, string memory name, string memory version, uint256 chainId, address vc,,) = v.eip712Domain();
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                vc
            )
        );
    }

    function _sign(VaultV2 v, uint256 key, bytes32 structHash) private returns (bytes memory) {
        (uint8 vv, bytes32 r, bytes32 s) = vm.sign(key, keccak256(abi.encodePacked("\x19\x01", _domain(v), structHash)));
        return abi.encodePacked(r, s, vv);
    }
}

contract VaultV2IndexInvariantTest is Test {
    VaultFactoryV2 internal factory;
    IndexHandler internal handler;

    function setUp() public {
        VaultV2 impl = new VaultV2();
        factory = new VaultFactoryV2(address(impl), payable(makeAddr("fr")), 1 ether, makeAddr("safe"));
        handler = new IndexHandler(factory);
        targetContract(address(handler));
    }

    /// @dev Proves the handler really performs successful imports, so the invariants are not vacuous.
    function test_Handler_ImportsActuallyHappen() public {
        handler.create(0, 11);
        handler.create(1, 22);
        handler.importTo(0, 3); // vault 0 moves to a free actor
        handler.importTo(1, 0); // vault 1 moves to the now-free actor 0
        assertEq(handler.imports(), 2);
        assertEq(factory.getVault(handler.actors(3)), address(handler.vaults(0)));
        assertEq(factory.getVault(handler.actors(0)), address(handler.vaults(1)));
        assertEq(factory.getVault(handler.actors(1)), address(0));
        invariant_IndexMirrorsOwnership();
    }

    /// @dev Every vault is indexed under its current owner, and every index entry points at a vault its key owns.
    function invariant_IndexMirrorsOwnership() public view {
        uint256 n = handler.vaultCount();
        for (uint256 i = 0; i < n; i++) {
            VaultV2 v = handler.vaults(i);
            assertEq(factory.getVault(v.owner()), address(v));
            assertTrue(factory.isVault(address(v)));
        }
        for (uint256 i = 0; i < handler.N(); i++) {
            address actor = handler.actors(i);
            address g = factory.getVault(actor);
            if (g != address(0)) assertEq(VaultV2(payable(g)).owner(), actor);
        }
    }

    function invariant_FactoryBalanceCoversAccruedFees() public view {
        assertGe(address(factory).balance, factory.accruedFees());
    }
}
