import crypto from "crypto";

// In Node 20+, globalThis.crypto is already available
globalThis.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
globalThis.atob = (b64) => Buffer.from(b64, 'base64').toString('binary');

// Import crypto functions
const { encryptVault, decryptVault } = await import("../src/lolicordplugins/totpManager/crypto.ts");

console.log("=== Testing Encrypt -> Cloud Payload Shape -> Restore Decrypt ===");

const sampleAccounts = [
    {
        id: "totp_123",
        name: "Discord (zion)",
        secret: "JBSWY3DPEHPK3PXP",
        digits: 6,
        period: 30,
        algorithm: "SHA-1",
        createdAt: 1700000000000
    }
];

const masterPass = "mypassword123";
const rawJson = JSON.stringify(sampleAccounts);

// 1. Encrypt
const envelope = await encryptVault(rawJson, masterPass);
console.log("1. Encrypted Envelope:", envelope);

// 2. Simulate Cloud Save (PUT /api/sync/totp-manager)
const cloudPayload = {
    token: "mock-token",
    private: true,
    settings: {
        private: true,
        version: 1,
        ...envelope
    }
};

// 3. Simulate Cloud Get (GET /api/sync/totp-manager)
const cloudResponse = {
    plugin: "totp-manager",
    userId: "123456",
    config: {
        plugin: "totp-manager",
        userId: "123456",
        settings: cloudPayload.settings
    }
};

// 4. Simulate pullEncryptedVaultFromCloud reconstruction
const settingsObj = cloudResponse.config.settings;
const reconstructedEnvelope = {
    version: settingsObj.version || 1,
    salt: settingsObj.salt,
    aesIv: settingsObj.aesIv,
    chachaNonce: settingsObj.chachaNonce || settingsObj.chachaIv || "",
    ciphertext: settingsObj.ciphertext,
    iterations: settingsObj.iterations || 600000,
    timestamp: settingsObj.timestamp || Date.now()
};

// 5. Decrypt
const decrypted = await decryptVault(reconstructedEnvelope, masterPass);
console.log("5. Decrypted string:", decrypted);

const restoredAccounts = JSON.parse(decrypted);
if (restoredAccounts[0].name === "Discord (zion)") {
    console.log(" SUCCESS! Full pipeline works perfectly.");
} else {
    throw new Error("Failed to restore correct accounts");
}
