# Issuer Module Backend

This backend provides the standalone issuer-side API for a demo zk-SNARK age verification prototype. It is not a real government system and does not implement blockchain, ZK proof generation, or verifier integration.

## Security model

- Private keys are generated and stored only on the backend.
- The private key is never returned in JSON responses.
- The browser receives only the public key and key identifier.
- All API inputs are validated before issuance or verification.
- The credential signing implementation uses Ed25519 from @noble/curves.

## Key management

### Generate a keypair

Request:

```http
POST /api/issuer/keys/generate
Content-Type: application/json
```

Response:

```json
{
  "status": "generated",
  "issuer": "Demo Municipal Age Verification Authority",
  "keyId": "9f06d1f7-c083-4a8a-b2df-1ec2d18be1bb",
  "publicKeyHex": "8fe458f8b2bf3f5f93d0cf7c3e3b9fdc7f7f2fe5c1b6739112aa2f9685ab2f4d",
  "warning": "Private key remains on the backend only and is never exposed to the browser."
}
```

### Get the current key

Request:

```http
GET /api/issuer/keys/current
```

Response:

```json
{
  "status": "ok",
  "issuer": "Demo Municipal Age Verification Authority",
  "keyId": "9f06d1f7-c083-4a8a-b2df-1ec2d18be1bb",
  "publicKeyHex": "8fe458f8b2bf3f5f93d0cf7c3e3b9fdc7f7f2fe5c1b6739112aa2f9685ab2f4d"
}
```

## Age credential issuance

### Issue a signed age credential

Request:

```http
POST /api/issuer/credentials
Content-Type: application/json
```

Body:

```json
{
  "dateOfBirth": "2005-05-07"
}
```

Response:

```json
{
  "status": "issued",
  "credential": {
    "credentialId": "b5c2b7b3c058f6f90598f1d8d42d48f4",
    "issuer": "Demo Government Identity Authority",
    "type": "AgeCredential",
    "dateOfBirth": "2005-05-07",
    "issuedAt": "2026-10-09T07:24:58.351Z",
    "signatureAlgorithm": "Ed25519",
    "issuerKeyId": "9f06d1f7-c083-4a8a-b2df-1ec2d18be1bb"
  },
  "signature": "2c87b7f4f350d4c7d7efc9a0c8136f4cf0dd03d312c475e149e21818fef7f0a8250c4b6a805c738af9d7ad6f5c375b4708f8a2ca2ccad2f9c6f1274cc95e2b7",
  "issuerKeyId": "9f06d1f7-c083-4a8a-b2df-1ec2d18be1bb",
  "publicKeyHex": "8fe458f8b2bf3f5f93d0cf7c3e3b9fdc7f7f2fe5c1b6739112aa2f9685ab2f4d",
  "warning": "This is a signed age credential prototype, not a zk-SNARK proof.",
  "signing": {
    "algorithm": "Ed25519",
    "canonicalization": {
      "fieldsSigned": [
        "credentialId",
        "issuer",
        "type",
        "dateOfBirth",
        "issuedAt",
        "signatureAlgorithm",
        "issuerKeyId"
      ],
      "serialization": "JSON.stringify is applied to the credential fields in the exact object order shown above with no whitespace or extra formatting."
    }
  }
}
```

### Verification

Request:

```http
POST /api/issuer/credentials/verify
Content-Type: application/json
```

Body:

```json
{
  "credential": {
    "credentialId": "b5c2b7b3c058f6f90598f1d8d42d48f4",
    "issuer": "Demo Government Identity Authority",
    "type": "AgeCredential",
    "dateOfBirth": "2005-05-07",
    "issuedAt": "2026-10-09T07:24:58.351Z",
    "signatureAlgorithm": "Ed25519",
    "issuerKeyId": "9f06d1f7-c083-4a8a-b2df-1ec2d18be1bb"
  },
  "signature": "2c87b7f4f350d4c7d7efc9a0c8136f4cf0dd03d312c475e149e21818fef7f0a8250c4b6a805c738af9d7ad6f5c375b4708f8a2ca2ccad2f9c6f1274cc95e2b7"
}
```

Response:

```json
{
  "valid": true,
  "status": "verified",
  "credential": {
    "credentialId": "b5c2b7b3c058f6f90598f1d8d42d48f4",
    "issuer": "Demo Government Identity Authority",
    "type": "AgeCredential",
    "dateOfBirth": "2005-05-07",
    "issuedAt": "2026-10-09T07:24:58.351Z",
    "signatureAlgorithm": "Ed25519",
    "issuerKeyId": "9f06d1f7-c083-4a8a-b2df-1ec2d18be1bb"
  },
  "signature": "2c87b7f4f350d4c7d7efc9a0c8136f4cf0dd03d312c475e149e21818fef7f0a8250c4b6a805c738af9d7ad6f5c375b4708f8a2ca2ccad2f9c6f1274cc95e2b7",
  "issuerKeyId": "9f06d1f7-c083-4a8a-b2df-1ec2d18be1bb",
  "message": "Credential signature is valid for the current issuer key."
}
```

## Canonical signing format

The signed payload is the canonical JSON serialization of these fields in this exact order:

1. `credentialId`
2. `issuer`
3. `type`
4. `dateOfBirth`
5. `issuedAt`
6. `signatureAlgorithm`
7. `issuerKeyId`

The backend signs the UTF-8 bytes of `JSON.stringify` on that object with no spacing or pretty printing. The signature is encoded as hexadecimal and stored separately from the credential. This prevents ambiguities and ensures a modified credential will fail validation.

## Notes

- This is a signed credential prototype, not a zk-SNARK proof.
- Signing alone does not prove age privately.
- The future ZK module will need the birth date as private input and will not rely on this prototype for privacy guarantees.
- No blockchain integration is included.
