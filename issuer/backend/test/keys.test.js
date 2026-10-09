const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { ed25519 } = require("@noble/curves/ed25519");
const { createKeyStore, fromHex } = require("../keyStore");

const tempKeyDir = path.join(__dirname, "tmp-keys");
const keyStore = createKeyStore(tempKeyDir);

function resetTempKeyDir() {
  if (fs.existsSync(tempKeyDir)) {
    fs.rmSync(tempKeyDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempKeyDir, { recursive: true, mode: 0o700 });
}

test("generated Ed25519 keypair signs and verifies a test message", () => {
  resetTempKeyDir();

  const generated = keyStore.generateKeypair();
  const current = keyStore.getCurrentKey();
  const privateKeyHex = keyStore.loadPrivateKeyHex();

  assert.ok(generated.keyId);
  assert.equal(current.keyId, generated.keyId);
  assert.equal(current.publicKeyHex, generated.publicKeyHex);
  assert.equal(privateKeyHex.length, 64);

  const message = new TextEncoder().encode("zk-SNARK age verification demo message");
  const privateKeyBytes = fromHex(privateKeyHex);
  const publicKeyBytes = fromHex(generated.publicKeyHex);
  const signature = ed25519.sign(message, privateKeyBytes);

  assert.equal(ed25519.verify(signature, message, publicKeyBytes), true);

  keyStore.clearKeypair();
});
