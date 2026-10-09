const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../server");
const { createKeyStore } = require("../keyStore");

const store = createKeyStore();

async function startTestServer() {
  const server = app.listen(0);
  const { port } = server.address();

  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

async function requestJSON(baseUrl, path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  return { status: response.status, data };
}

test.beforeEach(() => {
  store.clearKeypair();
});

test.afterEach(() => {
  store.clearKeypair();
});

test("issues a valid credential and verifies it", async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const generateResult = await requestJSON(baseUrl, "/api/issuer/keys/generate", {});
    assert.equal(generateResult.status, 201);
    assert.ok(generateResult.data.publicKeyHex);

    const issueResult = await requestJSON(baseUrl, "/api/issuer/credentials", {
      dateOfBirth: "2005-05-07",
    });

    assert.equal(issueResult.status, 201);
    assert.equal(issueResult.data.status, "issued");
    assert.equal(issueResult.data.credential.type, "AgeCredential");
    assert.equal(issueResult.data.credential.dateOfBirth, "2005-05-07");
    assert.equal(issueResult.data.signature.length, 128);

    const verifyResult = await requestJSON(baseUrl, "/api/issuer/credentials/verify", {
      credential: issueResult.data.credential,
      signature: issueResult.data.signature,
    });

    assert.equal(verifyResult.status, 200);
    assert.equal(verifyResult.data.valid, true);
    assert.equal(verifyResult.data.status, "verified");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("rejects tampered credentials", async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await requestJSON(baseUrl, "/api/issuer/keys/generate", {});
    const issueResult = await requestJSON(baseUrl, "/api/issuer/credentials", {
      dateOfBirth: "2005-05-07",
    });

    const tamperedCredential = {
      ...issueResult.data.credential,
      dateOfBirth: "2004-05-07",
    };

    const verifyResult = await requestJSON(baseUrl, "/api/issuer/credentials/verify", {
      credential: tamperedCredential,
      signature: issueResult.data.signature,
    });

    assert.equal(verifyResult.status, 200);
    assert.equal(verifyResult.data.valid, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("rejects invalid birth dates", async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await requestJSON(baseUrl, "/api/issuer/keys/generate", {});
    const invalidDate = await requestJSON(baseUrl, "/api/issuer/credentials", {
      dateOfBirth: "2029-02-30",
    });

    assert.equal(invalidDate.status, 400);
    assert.ok(invalidDate.data.error);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("requires an active issuer keypair before issuing", async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const issueResult = await requestJSON(baseUrl, "/api/issuer/credentials", {
      dateOfBirth: "2005-05-07",
    });

    assert.equal(issueResult.status, 404);
    assert.match(issueResult.data.error, /No active issuer keypair/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("rejects invalid signatures", async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await requestJSON(baseUrl, "/api/issuer/keys/generate", {});
    const issueResult = await requestJSON(baseUrl, "/api/issuer/credentials", {
      dateOfBirth: "2005-05-07",
    });

    const invalidSignature = "00".repeat(64);
    const verifyResult = await requestJSON(baseUrl, "/api/issuer/credentials/verify", {
      credential: issueResult.data.credential,
      signature: invalidSignature,
    });

    assert.equal(verifyResult.status, 200);
    assert.equal(verifyResult.data.valid, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("rejects credentials signed by a different private key", async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await requestJSON(baseUrl, "/api/issuer/keys/generate", {});
    const originalIssue = await requestJSON(baseUrl, "/api/issuer/credentials", {
      dateOfBirth: "2005-05-07",
    });

    const anotherKeyStore = createKeyStore(require("node:path").join(__dirname, "tmp-other-keys"));
    anotherKeyStore.clearKeypair();
    const otherKey = anotherKeyStore.generateKeypair();

    const { ed25519 } = require("@noble/curves/ed25519");
    const canonical = JSON.stringify({
      credentialId: originalIssue.data.credential.credentialId,
      issuer: originalIssue.data.credential.issuer,
      type: originalIssue.data.credential.type,
      dateOfBirth: originalIssue.data.credential.dateOfBirth,
      issuedAt: originalIssue.data.credential.issuedAt,
      signatureAlgorithm: originalIssue.data.credential.signatureAlgorithm,
      issuerKeyId: originalIssue.data.credential.issuerKeyId,
    });
    const signature = ed25519.sign(new TextEncoder().encode(canonical), require("node:fs").readFileSync(anotherKeyStore.PRIVATE_KEY_PATH, "utf8").length ? Uint8Array.from(Buffer.from(require("node:fs").readFileSync(anotherKeyStore.PRIVATE_KEY_PATH, "utf8"), "hex")) : new Uint8Array());

    const verifyResult = await requestJSON(baseUrl, "/api/issuer/credentials/verify", {
      credential: originalIssue.data.credential,
      signature: Buffer.from(signature).toString("hex"),
    });

    assert.equal(verifyResult.status, 200);
    assert.equal(verifyResult.data.valid, false);
    anotherKeyStore.clearKeypair();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
