const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { ed25519 } = require("@noble/curves/ed25519");
const { createKeyStore, fromHex, toHex } = require("./keyStore");

const app = express();
const PORT = process.env.PORT || 3001;
const keyStore = createKeyStore();

app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

function isValidHex(value, expectedLength) {
  if (typeof value !== "string") return false;
  if (!/^[0-9a-fA-F]+$/.test(value)) return false;
  return value.length === expectedLength;
}

function normalizeDateOfBirth(value) {
  if (typeof value !== "string") {
    throw new Error("Date of birth must be a string.");
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("Date of birth must use the format YYYY-MM-DD.");
  }

  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Date of birth is not a valid calendar date.");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (date > today) {
    throw new Error("Date of birth cannot be in the future.");
  }

  return trimmed;
}

function canonicalizeCredential(credential) {
  const canonical = {
    credentialId: credential.credentialId,
    issuer: credential.issuer,
    type: credential.type,
    dateOfBirth: credential.dateOfBirth,
    issuedAt: credential.issuedAt,
    signatureAlgorithm: credential.signatureAlgorithm,
    issuerKeyId: credential.issuerKeyId,
  };

  return JSON.stringify(canonical);
}

function validateCredentialShape(credential) {
  if (!credential || typeof credential !== "object") {
    throw new Error("Credential payload must be an object.");
  }

  const requiredFields = [
    "credentialId",
    "issuer",
    "type",
    "dateOfBirth",
    "issuedAt",
    "signatureAlgorithm",
    "issuerKeyId",
  ];

  for (const field of requiredFields) {
    if (!(field in credential)) {
      throw new Error(`Credential is missing required field: ${field}`);
    }
  }

  if (typeof credential.credentialId !== "string" || !credential.credentialId.trim()) {
    throw new Error("Credential ID is invalid.");
  }

  if (typeof credential.issuer !== "string" || !credential.issuer.trim()) {
    throw new Error("Issuer identifier is invalid.");
  }

  if (typeof credential.type !== "string" || !credential.type.trim()) {
    throw new Error("Credential type is invalid.");
  }

  if (typeof credential.dateOfBirth !== "string") {
    throw new Error("Date of birth must be a string in the credential.");
  }

  normalizeDateOfBirth(credential.dateOfBirth);

  if (typeof credential.issuedAt !== "string" || !credential.issuedAt.trim()) {
    throw new Error("Issued timestamp is invalid.");
  }

  if (credential.signatureAlgorithm !== "Ed25519") {
    throw new Error("Signature algorithm must be Ed25519.");
  }

  if (typeof credential.issuerKeyId !== "string" || !credential.issuerKeyId.trim()) {
    throw new Error("Issuer key identifier is invalid.");
  }
}

function calculateAge(dateOfBirth) {
  const birthDate = new Date(`${dateOfBirth}T00:00:00Z`);
  const today = new Date();
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDifference = today.getUTCMonth() - birthDate.getUTCMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getUTCDate() < birthDate.getUTCDate())
  ) {
    age -= 1;
  }

  return age;
}

app.get("/api/issuer/health", (_req, res) => {
  res.json({
    status: "ok",
    issuer: "Demo Municipal Age Verification Authority",
    mode: "demo",
    message: "This issuer module is for demonstration only and not a real government agency.",
  });
});

function handleGenerateKeypairRoute(_req, res) {
  try {
    const keypair = keyStore.generateKeypair();

    return res.status(201).json({
      status: "generated",
      issuer: "Demo Municipal Age Verification Authority",
      keyId: keypair.keyId,
      publicKeyHex: keypair.publicKeyHex,
      warning: "Private key remains on the backend only and is never exposed to the browser.",
    });
  } catch (error) {
    const statusCode = error.code === "KEYPAIR_EXISTS" ? 409 : 500;
    return res.status(statusCode).json({
      error: error.code === "KEYPAIR_EXISTS"
        ? "A keypair already exists. Use the current key instead of generating a new one."
        : "Failed to generate a cryptographic keypair.",
      details: error.message,
    });
  }
}

app.post("/api/issuer/keys/generate", handleGenerateKeypairRoute);

app.get("/api/issuer/keys/current", (_req, res) => {
  try {
    const current = keyStore.getCurrentKey();

    if (!current) {
      return res.status(404).json({
        error: "No active keypair has been generated yet.",
      });
    }

    return res.json({
      status: "ok",
      issuer: "Demo Municipal Age Verification Authority",
      keyId: current.keyId,
      publicKeyHex: current.publicKeyHex,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Unable to read the current public key.",
      details: error.message,
    });
  }
});

app.post("/api/issuer/generate-keypair", handleGenerateKeypairRoute);

app.post("/api/issuer/credentials", (req, res) => {
  try {
    const { dateOfBirth } = req.body || {};

    if (!dateOfBirth || typeof dateOfBirth !== "string") {
      return res.status(400).json({
        error: "dateOfBirth is required and must be a string.",
      });
    }

    const validatedDob = normalizeDateOfBirth(dateOfBirth);
    const currentKey = keyStore.getCurrentKey();

    if (!currentKey) {
      return res.status(404).json({
        error: "No active issuer keypair exists. Generate an issuer keypair first.",
      });
    }

    const credential = {
      credentialId: crypto.randomBytes(16).toString("hex"),
      issuer: "Demo Government Identity Authority",
      type: "AgeCredential",
      dateOfBirth: validatedDob,
      issuedAt: new Date().toISOString(),
      signatureAlgorithm: "Ed25519",
      issuerKeyId: currentKey.keyId,
    };

    const canonicalPayload = canonicalizeCredential(credential);
    const privateKeyHex = keyStore.loadPrivateKeyHex();
    const privateKeyBytes = fromHex(privateKeyHex);
    const signature = ed25519.sign(new TextEncoder().encode(canonicalPayload), privateKeyBytes);
    const signatureHex = toHex(signature);

    return res.status(201).json({
      status: "issued",
      credential,
      signature: signatureHex,
      issuerKeyId: currentKey.keyId,
      publicKeyHex: currentKey.publicKeyHex,
      warning: "This is a signed age credential prototype, not a zk-SNARK proof.",
      signing: {
        algorithm: "Ed25519",
        canonicalization: {
          fieldsSigned: [
            "credentialId",
            "issuer",
            "type",
            "dateOfBirth",
            "issuedAt",
            "signatureAlgorithm",
            "issuerKeyId",
          ],
          serialization: "JSON.stringify is applied to the credential fields in the exact object order shown above with no whitespace or extra formatting.",
        },
      },
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message || "Unable to issue age credential.",
    });
  }
});

app.post("/api/issuer/credentials/verify", (req, res) => {
  try {
    const { credential, signature } = req.body || {};

    if (!credential || !signature) {
      return res.status(400).json({
        error: "credential and signature are required.",
      });
    }

    validateCredentialShape(credential);

    if (!isValidHex(signature, 128)) {
      return res.status(400).json({
        error: "Signature must be a valid 128-character hexadecimal string.",
      });
    }

    const currentKey = keyStore.getCurrentKey();
    if (!currentKey) {
      return res.status(404).json({
        error: "No active issuer keypair exists for verification.",
      });
    }

    if (credential.issuerKeyId !== currentKey.keyId) {
      return res.status(400).json({
        valid: false,
        status: "invalid",
        error: "Credential issuer key does not match the current issuer key.",
      });
    }

    const canonicalPayload = canonicalizeCredential(credential);
    const signatureBytes = fromHex(signature);
    const publicKeyBytes = fromHex(currentKey.publicKeyHex);
    const valid = ed25519.verify(
      signatureBytes,
      new TextEncoder().encode(canonicalPayload),
      publicKeyBytes
    );

    if (!valid) {
      return res.status(200).json({
        valid: false,
        status: "invalid",
        credential,
        signature,
        message: "Credential signature is invalid or the credential was modified.",
      });
    }

    return res.status(200).json({
      valid: true,
      status: "verified",
      credential,
      signature,
      issuerKeyId: currentKey.keyId,
      message: "Credential signature is valid for the current issuer key.",
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message || "Verification failed.",
    });
  }
});

app.post("/api/issuer/issue-credential", (req, res) => {
  try {
    const { fullName, dateOfBirth } = req.body || {};

    if (typeof fullName !== "string" || !fullName.trim()) {
      return res.status(400).json({ error: "Full name is required." });
    }

    const normalizedDob = normalizeDateOfBirth(dateOfBirth);
    const currentKey = keyStore.getCurrentKey();

    if (!currentKey) {
      return res.status(400).json({
        error: "Generate an issuer keypair before issuing a credential.",
      });
    }

    const privateKeyHex = keyStore.loadPrivateKeyHex();
    const credential = {
      issuer: "Demo Municipal Age Verification Authority",
      type: ["AgeCredential", "DemoCredential"],
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        fullName: fullName.trim(),
        dateOfBirth: normalizedDob,
        age: calculateAge(normalizedDob),
        citizenship: "Demo Republic",
      },
      status: "demo-only",
      note: "This credential is issued for demonstration and is not a legal government document.",
      id: `demo-cred-${currentKey.keyId}`,
    };

    const messageBytes = new TextEncoder().encode(JSON.stringify(credential));
    const privateKeyBytes = fromHex(privateKeyHex);
    const signature = ed25519.sign(messageBytes, privateKeyBytes);
    const signatureHex = toHex(signature);

    return res.json({
      status: "issued",
      issuer: "Demo Municipal Age Verification Authority",
      keyId: currentKey.keyId,
      publicKeyHex: currentKey.publicKeyHex,
      credential,
      signature: signatureHex,
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message || "Failed to issue age credential.",
    });
  }
});

app.post("/api/issuer/verify-credential", (req, res) => {
  try {
    const { credential, signature, publicKeyHex } = req.body || {};

    if (!credential || !signature || !publicKeyHex) {
      return res.status(400).json({
        error: "Credential, signature, and public key are required.",
      });
    }

    if (!isValidHex(publicKeyHex, 64)) {
      return res.status(400).json({ error: "Public key must be a valid 64-character hex string." });
    }

    if (!isValidHex(signature, 128)) {
      return res.status(400).json({ error: "Signature must be a valid 128-character hex string." });
    }

    const messageBytes = new TextEncoder().encode(JSON.stringify(credential));
    const signatureBytes = fromHex(signature);
    const publicKeyBytes = fromHex(publicKeyHex);
    const valid = ed25519.verify(signatureBytes, messageBytes, publicKeyBytes);

    return res.json({
      status: valid ? "verified" : "invalid",
      valid,
      issuer: "Demo Municipal Age Verification Authority",
      publicKeyHex,
      message: valid
        ? "Credential signature is valid for the published public key."
        : "Credential signature does not match the public key.",
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message || "Failed to verify credential signature.",
    });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Issuer backend running on http://localhost:${PORT}`);
  });
}

module.exports = app;
