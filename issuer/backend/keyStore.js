const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ed25519 } = require("@noble/curves/ed25519");

function toHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

function fromHex(hexString) {
  return Uint8Array.from(Buffer.from(hexString, "hex"));
}

function createKeyStore(baseDir = path.join(__dirname, "keys")) {
  const PRIVATE_KEY_PATH = path.join(baseDir, "issuer-private-key.hex");
  const PUBLIC_KEY_PATH = path.join(baseDir, "issuer-public-key.hex");
  const KEY_ID_PATH = path.join(baseDir, "issuer-key-id.txt");

  function ensureKeyDirectory() {
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true, mode: 0o700 });
    }
  }

  function writeSecureFile(filePath, content) {
    fs.writeFileSync(filePath, content, {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  function readTextIfExists(filePath) {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    return fs.readFileSync(filePath, "utf8").trim();
  }

  function hasExistingKeypair() {
    ensureKeyDirectory();
    return (
      fs.existsSync(PRIVATE_KEY_PATH) &&
      fs.existsSync(PUBLIC_KEY_PATH) &&
      fs.existsSync(KEY_ID_PATH)
    );
  }

  function generateKeypair() {
    ensureKeyDirectory();

    if (hasExistingKeypair()) {
      const error = new Error("A keypair already exists. Remove it before generating a new one.");
      error.code = "KEYPAIR_EXISTS";
      throw error;
    }

    const privateKey = ed25519.utils.randomPrivateKey();
    const publicKey = ed25519.getPublicKey(privateKey);
    const privateKeyHex = toHex(privateKey);
    const publicKeyHex = toHex(publicKey);
    const keyId = crypto.randomUUID();

    writeSecureFile(PRIVATE_KEY_PATH, privateKeyHex);
    writeSecureFile(PUBLIC_KEY_PATH, publicKeyHex);
    writeSecureFile(KEY_ID_PATH, keyId);

    return {
      keyId,
      privateKeyHex,
      publicKeyHex,
    };
  }

  function getCurrentKey() {
    ensureKeyDirectory();

    if (!hasExistingKeypair()) {
      return null;
    }

    const keyId = readTextIfExists(KEY_ID_PATH);
    const publicKeyHex = readTextIfExists(PUBLIC_KEY_PATH);

    if (!keyId || !publicKeyHex || publicKeyHex.length !== 64) {
      throw new Error("Current key metadata is incomplete or invalid.");
    }

    return {
      keyId,
      publicKeyHex,
    };
  }

  function loadPrivateKeyHex() {
    ensureKeyDirectory();

    if (!fs.existsSync(PRIVATE_KEY_PATH)) {
      throw new Error("No active private key on the server. Generate a keypair first.");
    }

    const privateKeyHex = readTextIfExists(PRIVATE_KEY_PATH);
    if (!privateKeyHex || privateKeyHex.length !== 64) {
      throw new Error("Private key file is missing or invalid.");
    }

    return privateKeyHex;
  }

  function clearKeypair() {
    ensureKeyDirectory();
    for (const filePath of [PRIVATE_KEY_PATH, PUBLIC_KEY_PATH, KEY_ID_PATH]) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }

  return {
    generateKeypair,
    getCurrentKey,
    loadPrivateKeyHex,
    clearKeypair,
    PRIVATE_KEY_PATH,
    PUBLIC_KEY_PATH,
    KEY_ID_PATH,
    fromHex,
    toHex,
  };
}

module.exports = {
  createKeyStore,
  toHex,
  fromHex,
};
