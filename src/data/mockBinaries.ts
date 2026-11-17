import { BinarySample } from '../types';

export const sampleBinaries: BinarySample[] = [
  {
    id: 'bin_secure_crypto',
    filename: 'libSecureCryptoCore.dylib',
    arch: 'ARM64 (Mach-O 64-bit)',
    format: 'Mach-O dynamically linked shared library',
    fileSize: '1.42 MB',
    sha256: '9f83a21b8c04e12e34fa5920a65c2b0c14f9d45e78bc12a0349ef854201bfa01',
    functions: [
      {
        id: 'func_verify_license',
        address: '0x100003fa0',
        name: '_$s16SecureCryptoCore14LicenseManagerC13verifyLicense4withSbSS_tF',
        demangledName: 'SecureCryptoCore.LicenseManager.verifyLicense(with: Swift.String) -> Swift.Bool',
        size: 128,
        arch: 'ARM64',
        callingConv: 'swiftcall',
        hlil: `bool __fastcall SecureCryptoCore::LicenseManager::verifyLicense(String licenseKey) {
    void* cryptoContext = SecKeyCreateRandomKey(kSecAttrKeyTypeECSECPrimeRandom, 256, nullptr);
    if (!cryptoContext) {
        os_log_error(OS_LOG_DEFAULT, "Failed to initialize hardware Secure Enclave");
        return false;
    }

    uint8_t hardwareDigest[32];
    CC_SHA256(licenseKey.utf8Start, licenseKey.utf8Count, hardwareDigest);

    // Target Check: License validation check against enclave public signature
    int32_t authStatus = SecKeyVerifySignature(cryptoContext, kSecKeyAlgorithmECDSASignatureRFC4754, hardwareDigest, 32, licenseKey.signatureBytes, 64, nullptr);

    if (authStatus != 0) { // Check failed: authStatus is errSecAuthFailed
        os_log_debug(OS_LOG_DEFAULT, "License signature verification failed with error: %d", authStatus);
        return false;
    }

    return true; // Validated
}`,
        instructions: [
          { address: '0x100003fa0', rawBytes: 'FD 7B BE A9', mnemonic: 'STP', operands: 'x29, x30, [sp, #-32]!' },
          { address: '0x100003fa4', rawBytes: 'FD 03 00 91', mnemonic: 'MOV', operands: 'x29, sp' },
          { address: '0x100003fa8', rawBytes: 'F4 4F 01 A9', mnemonic: 'STP', operands: 'x20, x19, [sp, #16]' },
          { address: '0x100003fac', rawBytes: 'E0 03 00 AA', mnemonic: 'MOV', operands: 'x19, x0', comment: 'Store licenseKey pointer in x19' },
          { address: '0x100003fb0', rawBytes: '00 00 80 D2', mnemonic: 'MOV', operands: 'x0, #0', comment: 'kSecAttrKeyTypeECSECPrimeRandom' },
          { address: '0x100003fb4', rawBytes: '01 04 80 D2', mnemonic: 'MOV', operands: 'x1, #256', comment: 'Key bit size' },
          { address: '0x100003fb8', rawBytes: '22 00 00 94', mnemonic: 'BL', operands: '_SecKeyCreateRandomKey', isCall: true },
          { address: '0x100003fbc', rawBytes: 'E0 07 00 B4', mnemonic: 'CBZ', operands: 'x0, 0x100004020', isBranch: true, comment: 'Branch if enclave key context null' },
          { address: '0x100003fc0', rawBytes: 'E1 03 00 AA', mnemonic: 'MOV', operands: 'x1, x0', comment: 'cryptoContext' },
          { address: '0x100003fc4', rawBytes: '3F 00 00 94', mnemonic: 'BL', operands: '_CC_SHA256', isCall: true },
          { address: '0x100003fc8', rawBytes: '15 00 00 94', mnemonic: 'BL', operands: '_SecKeyVerifySignature', isCall: true },
          { address: '0x100003fcc', rawBytes: '1F 00 00 71', mnemonic: 'CMP', operands: 'w0, #0', comment: 'Check authStatus == 0' },
          { address: '0x100003fd0', rawBytes: '81 01 00 54', mnemonic: 'B.NE', operands: '0x100004020', isBranch: true, comment: 'CRITICAL CHECK: Jump to failure if authStatus != 0' },
          { address: '0x100003fd4', rawBytes: '20 00 80 D2', mnemonic: 'MOV', operands: 'x0, #1', comment: 'Return true' },
          { address: '0x100003fd8', rawBytes: 'F4 4F 41 A9', mnemonic: 'LDP', operands: 'x20, x19, [sp, #16]' },
          { address: '0x100003fdc', rawBytes: 'FD 7B C2 A8', mnemonic: 'LDP', operands: 'x29, x30, [sp], #32' },
          { address: '0x100003fe0', rawBytes: 'C0 03 5F D6', mnemonic: 'RET', operands: '', isReturn: true },
          { address: '0x100004020', rawBytes: '00 00 80 D2', mnemonic: 'MOV', operands: 'x0, #0', comment: 'Return false (failed check)' },
          { address: '0x100004024', rawBytes: 'F4 4F 41 A9', mnemonic: 'LDP', operands: 'x20, x19, [sp, #16]' },
          { address: '0x100004028', rawBytes: 'FD 7B C2 A8', mnemonic: 'LDP', operands: 'x29, x30, [sp], #32' },
          { address: '0x10000402c', rawBytes: 'C0 03 5F D6', mnemonic: 'RET', operands: '', isReturn: true },
        ],
        xrefs: [
          { fromAddr: '0x100002140', funcName: 'AppDelegate.applicationDidFinishLaunching', type: 'call' },
          { fromAddr: '0x1000058b0', funcName: 'FeatureGuard.unlockPremiumFeatures', type: 'call' },
        ],
        strings: [
          'Failed to initialize hardware Secure Enclave',
          'License signature verification failed with error: %d',
          'kSecAttrKeyTypeECSECPrimeRandom',
          'com.apple.security.enclave',
        ],
      },
      {
        id: 'func_jailbreak_check',
        address: '0x100004110',
        name: '_$s16SecureCryptoCore15SecurityServiceC13isDeviceSafeSbtyF',
        demangledName: 'SecureCryptoCore.SecurityService.isDeviceSafe() -> Swift.Bool',
        size: 96,
        arch: 'ARM64',
        callingConv: 'swiftcall',
        hlil: `bool __fastcall SecureCryptoCore::SecurityService::isDeviceSafe() {
    const char* pathsToCheck[] = {
        "/Applications/Cydia.app",
        "/Library/MobileSubstrate/MobileSubstrate.dylib",
        "/bin/bash",
        "/usr/sbin/sshd",
        "/etc/apt",
        "/usr/bin/frida-server"
    };

    for (int i = 0; i < 6; i++) {
        if (access(pathsToCheck[i], F_OK) == 0) {
            return false; // Compromised environment detected
        }
    }

    // Check ptrace anti-debugging
    if (ptrace(PT_DENY_ATTACH, 0, 0, 0) < 0) {
        return false;
    }

    return true;
}`,
        instructions: [
          { address: '0x100004110', rawBytes: 'FD 7B BE A9', mnemonic: 'STP', operands: 'x29, x30, [sp, #-32]!' },
          { address: '0x100004114', rawBytes: 'FD 03 00 91', mnemonic: 'MOV', operands: 'x29, sp' },
          { address: '0x100004118', rawBytes: '20 00 00 90', mnemonic: 'ADRP', operands: 'x0, 0x100012000' },
          { address: '0x10000411c', rawBytes: '00 40 40 F9', mnemonic: 'LDR', operands: 'x0, [x0, #128]', comment: 'Load "/Applications/Cydia.app"' },
          { address: '0x100004120', rawBytes: '01 00 80 D2', mnemonic: 'MOV', operands: 'x1, #0', comment: 'F_OK' },
          { address: '0x100004124', rawBytes: '40 01 00 94', mnemonic: 'BL', operands: '_access', isCall: true },
          { address: '0x100004128', rawBytes: '1F 00 00 71', mnemonic: 'CMP', operands: 'w0, #0' },
          { address: '0x10000412c', rawBytes: '40 00 00 54', mnemonic: 'B.EQ', operands: '0x100004140', isBranch: true, comment: 'If file exists, exit false' },
          { address: '0x100004130', rawBytes: '20 00 80 D2', mnemonic: 'MOV', operands: 'x0, #1', comment: 'Safe environment' },
          { address: '0x100004134', rawBytes: 'FD 7B C2 A8', mnemonic: 'LDP', operands: 'x29, x30, [sp], #32' },
          { address: '0x100004138', rawBytes: 'C0 03 5F D6', mnemonic: 'RET', operands: '', isReturn: true },
          { address: '0x100004140', rawBytes: '00 00 80 D2', mnemonic: 'MOV', operands: 'x0, #0', comment: 'Compromised' },
          { address: '0x100004144', rawBytes: 'FD 7B C2 A8', mnemonic: 'LDP', operands: 'x29, x30, [sp], #32' },
          { address: '0x100004148', rawBytes: 'C0 03 5F D6', mnemonic: 'RET', operands: '', isReturn: true },
        ],
        xrefs: [
          { fromAddr: '0x100001090', funcName: 'main', type: 'call' },
          { fromAddr: '0x100003020', funcName: 'NetworkSession.init', type: 'call' },
        ],
        strings: [
          '/Applications/Cydia.app',
          '/Library/MobileSubstrate/MobileSubstrate.dylib',
          '/usr/bin/frida-server',
          'PT_DENY_ATTACH',
        ],
      },
      {
        id: 'func_process_purchase',
        address: '0x100006200',
        name: '_$s16SecureCryptoCore12StoreManagerC15processPurchase7productSbSS_tF',
        demangledName: 'SecureCryptoCore.StoreManager.processPurchase(product: Swift.String) -> Swift.Bool',
        size: 144,
        arch: 'ARM64',
        callingConv: 'swiftcall',
        hlil: `bool __fastcall SecureCryptoCore::StoreManager::processPurchase(String productId) {
    SKPaymentQueue* defaultQueue = [SKPaymentQueue defaultQueue];
    SKProduct* product = [StoreManager fetchProductWithIdentifier:productId];
    if (!product) {
        os_log_error(OS_LOG_DEFAULT, "Product identifier %s not found in StoreKit catalog", productId.utf8Start);
        return false;
    }

    // Receipt verification check
    bool receiptValid = [ReceiptValidator validateLocalReceiptForProduct:productId];
    if (!receiptValid) {
        os_log_debug(OS_LOG_DEFAULT, "Receipt verification rejected for product %s", productId.utf8Start);
        return false;
    }

    [UserEntitlements grantProductTier:product.tierIdentifier];
    return true; // Purchase completed successfully
}`,
        instructions: [
          { address: '0x100006200', rawBytes: 'FD 7B BE A9', mnemonic: 'STP', operands: 'x29, x30, [sp, #-32]!' },
          { address: '0x100006204', rawBytes: 'FD 03 00 91', mnemonic: 'MOV', operands: 'x29, sp' },
          { address: '0x100006208', rawBytes: 'F4 4F 01 A9', mnemonic: 'STP', operands: 'x20, x19, [sp, #16]' },
          { address: '0x10000620c', rawBytes: 'E0 03 00 AA', mnemonic: 'MOV', operands: 'x19, x0', comment: 'Store productId' },
          { address: '0x100006210', rawBytes: '20 00 00 90', mnemonic: 'ADRP', operands: 'x0, 0x100032000' },
          { address: '0x100006214', rawBytes: '00 00 40 F9', mnemonic: 'LDR', operands: 'x0, [x0, #0]', comment: 'SKPaymentQueue defaultQueue' },
          { address: '0x100006218', rawBytes: '40 01 00 94', mnemonic: 'BL', operands: '_objc_msgSend', isCall: true },
          { address: '0x10000621c', rawBytes: 'E0 03 13 AA', mnemonic: 'MOV', operands: 'x0, x19' },
          { address: '0x100006220', rawBytes: '18 01 00 94', mnemonic: 'BL', operands: '_$s16SecureCryptoCore16ReceiptValidatorC17validateSignatureSbyF', isCall: true },
          { address: '0x100006224', rawBytes: '1F 00 00 71', mnemonic: 'CMP', operands: 'w0, #0', comment: 'Test receipt validation' },
          { address: '0x100006228', rawBytes: '61 00 00 54', mnemonic: 'B.NE', operands: '0x100006240', isBranch: true, comment: 'Branch if receipt validation passed' },
          { address: '0x10000622c', rawBytes: '00 00 80 D2', mnemonic: 'MOV', operands: 'x0, #0', comment: 'Return false (purchase rejected)' },
          { address: '0x100006230', rawBytes: 'F4 4F 41 A9', mnemonic: 'LDP', operands: 'x20, x19, [sp, #16]' },
          { address: '0x100006234', rawBytes: 'FD 7B C2 A8', mnemonic: 'LDP', operands: 'x29, x30, [sp], #32' },
          { address: '0x100006238', rawBytes: 'C0 03 5F D6', mnemonic: 'RET', operands: '', isReturn: true },
          { address: '0x100006240', rawBytes: '20 00 80 D2', mnemonic: 'MOV', operands: 'x0, #1', comment: 'Return true (purchase granted)' },
          { address: '0x100006244', rawBytes: 'F4 4F 41 A9', mnemonic: 'LDP', operands: 'x20, x19, [sp, #16]' },
          { address: '0x100006248', rawBytes: 'FD 7B C2 A8', mnemonic: 'LDP', operands: 'x29, x30, [sp], #32' },
          { address: '0x10000624c', rawBytes: 'C0 03 5F D6', mnemonic: 'RET', operands: '', isReturn: true },
        ],
        xrefs: [
          { fromAddr: '0x100005110', funcName: 'IAPViewController.didSelectProduct', type: 'call' },
          { fromAddr: '0x100008400', funcName: 'StoreKitCoordinator.restoreCompletedTransactions', type: 'call' },
        ],
        strings: [
          'SKPaymentQueue',
          'Product identifier %s not found in StoreKit catalog',
          'Receipt verification rejected for product %s',
          'com.apple.storekit.transaction',
        ],
      },
      {
        id: 'func_validate_receipt',
        address: '0x100007140',
        name: '_$s16SecureCryptoCore16ReceiptValidatorC17validateSignatureSbyF',
        demangledName: 'SecureCryptoCore.ReceiptValidator.validateSignature() -> Swift.Bool',
        size: 96,
        arch: 'ARM64',
        callingConv: 'swiftcall',
        hlil: `bool __fastcall SecureCryptoCore::ReceiptValidator::validateSignature() {
    NSURL* appStoreReceiptURL = [[NSBundle mainBundle] appStoreReceiptURL];
    NSData* receiptData = [NSData dataWithContentsOfURL:appStoreReceiptURL];
    if (!receiptData || receiptData.length == 0) {
        return false;
    }
    // Parse ASN.1 PKCS#7 container and verify Apple Root Certificate Chain
    int verifyResult = SecPKCS7VerifyCopySignerCerts(receiptData.bytes, receiptData.length, nullptr);
    return (verifyResult == 0);
}`,
        instructions: [
          { address: '0x100007140', rawBytes: 'FD 7B BE A9', mnemonic: 'STP', operands: 'x29, x30, [sp, #-32]!' },
          { address: '0x100007144', rawBytes: 'FD 03 00 91', mnemonic: 'MOV', operands: 'x29, sp' },
          { address: '0x100007148', rawBytes: '20 00 00 90', mnemonic: 'ADRP', operands: 'x0, 0x100040000' },
          { address: '0x10000714c', rawBytes: '00 00 40 F9', mnemonic: 'LDR', operands: 'x0, [x0, #0]', comment: 'appStoreReceiptURL' },
          { address: '0x100007150', rawBytes: '50 01 00 94', mnemonic: 'BL', operands: '_SecPKCS7VerifyCopySignerCerts', isCall: true },
          { address: '0x100007154', rawBytes: '1F 00 00 71', mnemonic: 'CMP', operands: 'w0, #0' },
          { address: '0x100007158', rawBytes: '41 00 00 54', mnemonic: 'B.NE', operands: '0x100007168', isBranch: true },
          { address: '0x10000715c', rawBytes: '20 00 80 D2', mnemonic: 'MOV', operands: 'x0, #1', comment: 'Valid receipt' },
          { address: '0x100007160', rawBytes: 'FD 7B C2 A8', mnemonic: 'LDP', operands: 'x29, x30, [sp], #32' },
          { address: '0x100007164', rawBytes: 'C0 03 5F D6', mnemonic: 'RET', operands: '', isReturn: true },
          { address: '0x100007168', rawBytes: '00 00 80 D2', mnemonic: 'MOV', operands: 'x0, #0', comment: 'Invalid receipt' },
          { address: '0x10000716c', rawBytes: 'FD 7B C2 A8', mnemonic: 'LDP', operands: 'x29, x30, [sp], #32' },
          { address: '0x100007170', rawBytes: 'C0 03 5F D6', mnemonic: 'RET', operands: '', isReturn: true },
        ],
        xrefs: [
          { fromAddr: '0x100006220', funcName: 'StoreManager.processPurchase', type: 'call' },
        ],
        strings: [
          'appStoreReceiptURL',
          '_SecPKCS7VerifyCopySignerCerts',
          'Apple Inc. Root CA',
        ],
      },
    ],
  },
  {
    id: 'bin_ios_authenticator',
    filename: 'MobileAuthenticator.app/MobileAuthenticator',
    arch: 'ARM64e (iOS 17+ Mach-O)',
    format: 'Mach-O 64-bit executable arm64e with Pointer Authentication (PAC)',
    fileSize: '3.88 MB',
    sha256: 'a14092b77cd891e479c09bf872b83ef18090289ab71029c12349e58012b10a22',
    functions: [
      {
        id: 'func_biometric_auth',
        address: '0x1000189a0',
        name: '-[BiometricService authenticateUserWithReason:completion:]',
        demangledName: 'Objective-C: [BiometricService authenticateUserWithReason:completion:]',
        size: 112,
        arch: 'ARM64e',
        callingConv: 'cdecl',
        hlil: `void -[BiometricService authenticateUserWithReason:completion:](id self, SEL _cmd, NSString* reason, void (^completion)(BOOL success, NSError *error)) {
    LAContext* context = [[LAContext alloc] init];
    NSError* authError = nil;

    if ([context canEvaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics error:&authError]) {
        [context evaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics
                 localizedReason:reason
                           reply:^(BOOL success, NSError *error) {
            completion(success, error);
        }];
    } else {
        completion(NO, authError);
    }
}`,
        instructions: [
          { address: '0x1000189a0', rawBytes: 'FD 7B BE A9', mnemonic: 'STP', operands: 'x29, x30, [sp, #-32]!' },
          { address: '0x1000189a4', rawBytes: 'FD 03 00 91', mnemonic: 'MOV', operands: 'x29, sp' },
          { address: '0x1000189a8', rawBytes: '20 00 00 90', mnemonic: 'ADRP', operands: 'x0, 0x100030000' },
          { address: '0x1000189ac', rawBytes: '00 00 40 F9', mnemonic: 'LDR', operands: 'x0, [x0, #0]', comment: 'objc_msgSend: [LAContext alloc]' },
          { address: '0x1000189b0', rawBytes: '40 02 00 94', mnemonic: 'BL', operands: '_objc_msgSend', isCall: true },
          { address: '0x1000189b4', rawBytes: 'E0 03 00 AA', mnemonic: 'MOV', operands: 'x19, x0' },
          { address: '0x1000189b8', rawBytes: '01 00 80 D2', mnemonic: 'MOV', operands: 'x1, #1', comment: 'LAPolicyDeviceOwnerAuthenticationWithBiometrics' },
          { address: '0x1000189bc', rawBytes: '60 03 00 94', mnemonic: 'BL', operands: '_objc_msgSend', isCall: true },
          { address: '0x1000189c0', rawBytes: 'FD 7B C2 A8', mnemonic: 'LDP', operands: 'x29, x30, [sp], #32' },
          { address: '0x1000189c4', rawBytes: 'C0 03 5F D6', mnemonic: 'RET', operands: '', isReturn: true },
        ],
        xrefs: [
          { fromAddr: '0x100012400', funcName: 'LoginViewController.didTapBiometricLogin', type: 'call' },
        ],
        strings: [
          'LAContext',
          'canEvaluatePolicy:error:',
          'evaluatePolicy:localizedReason:reply:',
          'DeviceOwnerAuthenticationWithBiometrics',
        ],
      },
    ],
  },
];
