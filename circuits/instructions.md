# INSTRUCTIONS FOR CIRCUITS AGENT (`/circuits`)

## ROLE & MANDATE
You are an expert Zero-Knowledge Circuit Engineer. Your goal is to implement the Circom circuit, automated compilation pipeline, and Groth16 trusted setup for privacy-preserving age verification.

---

## 1. CRITICAL INTERFACE CONTRACTS (DO NOT CHANGE)

To prevent mismatches with `/client`, `/issuer`, and `/verifier`, your circuit **MUST** adhere to the following specifications:

### 1.1 Cryptographic Primitives
- **Elliptic Curve:** `BN128` (`bn254`) for Groth16 proof generation.
- **Embedded Curve:** `BabyJubjub` for Edwards-curve digital signatures (EdDSA).
- **Hash Function:** `Poseidon` (SNARK-friendly hash from `circomlib`).
- **Signature Scheme:** EdDSA over BabyJubjub using Poseidon hash (`EdDSAPoseidonVerifier` from `circomlib/circuits/eddsaposeidonverifier.circom`).

### 1.2 Exact Signal Names & Visibility
The main component must be instantiated in `circuits/age_check.circom` with these **exact signal names**:

```circom
template AgeCheck() {
    // ----------------------------------------------------
    // PUBLIC SIGNALS (Disclosed to Verifier)
    // ----------------------------------------------------
    signal input currentDate;      // Calendar date in YYYYMMDD format (e.g. 20261008)
    signal input ageLimit;         // Required age threshold in years (e.g. 18 or 21)
    signal input pubKeyX;          // Issuer BabyJubjub Public Key X coordinate
    signal input pubKeyY;          // Issuer BabyJubjub Public Key Y coordinate

    // ----------------------------------------------------
    // PRIVATE SIGNALS (Kept Secret / Witness Only)
    // ----------------------------------------------------
    signal input birthDate;        // Credential holder's birth date in YYYYMMDD (e.g. 20020515)
    signal input r8x;              // EdDSA signature R8 point X coordinate
    signal input r8y;              // EdDSA signature R8 point Y coordinate
    signal input s;                // EdDSA signature S scalar value

    // ----------------------------------------------------
    // 1. SIGNATURE VERIFICATION
    // ----------------------------------------------------
    component hasher = Poseidon(1);
    hasher.inputs[0] <== birthDate;

    component verifier = EdDSAPoseidonVerifier();
    verifier.enabled <-- 1;
    verifier.Ax <== pubKeyX;
    verifier.Ay <== pubKeyY;
    verifier.R8x <== r8x;
    verifier.R8y <== r8y;
    verifier.S <== s;
    verifier.M <== hasher.out;

    // ----------------------------------------------------
    // 2. DATE-ACCURATE AGE VERIFICATION
    // Cutoff date = currentDate - (ageLimit * 10000)
    // e.g. 20261008 - 180000 = 20081008
    // Enforce: cutoffDate >= birthDate (birthDate <= cutoffDate)
    // ----------------------------------------------------
    signal cutoffDate;
    cutoffDate <== currentDate - ageLimit * 10000;

    component check = GreaterEqThan(32);
    check.in[0] <== cutoffDate;
    check.in[1] <== birthDate;
    check.out === 1;
}

component main { public [currentDate, ageLimit, pubKeyX, pubKeyY] } = AgeCheck();
```

> **IMPORTANT:** Circom signal visibility: `currentDate`, `ageLimit`, `pubKeyX`, `pubKeyY` MUST be declared in `public [...]` in `component main`. `birthDate`, `r8x`, `r8y`, `s` MUST be private (default).

### 1.3 Target Output File Paths
When compiled and setup is complete, the following files **MUST** be generated:
1. `circuits/build/age_check_js/age_check.wasm` -> Copy to `client/public/age_check.wasm`
2. `circuits/build/age_check_final.zkey` -> Copy to `client/public/age_check_final.zkey`
3. `circuits/build/verification_key.json` -> Copy to `verifier/verification_key.json`

---

## 2. CIRCUIT LOGIC REQUIREMENTS

The circuit inside `circuits/age_check.circom` enforces two constraints:

### Constraint 1: Valid Issuer Signature
1. Compute `messageHash = Poseidon(1)([birthDate])`.
2. Verify that `(r8x, r8y, s)` is a valid EdDSA signature over `messageHash` under the public key `(pubKeyX, pubKeyY)`.

### Constraint 2: Date-Based Age Requirement Satisfied
1. Compute `cutoffDate = currentDate - ageLimit * 10000`.
2. Enforce `cutoffDate >= birthDate` using `GreaterEqThan(32)` from `circomlib/circuits/comparators.circom`.
   - Example 1: `currentDate = 20261008`, `ageLimit = 18` -> `cutoffDate = 20081008`.
   - User born `20081008` (turned 18 today) -> `20081008 >= 20081008` -> **PASS**.
   - User born `20081009` (turns 18 tomorrow) -> `20081008 >= 20081009` -> **FAIL**.
   - User born `20020515` (age 24) -> `20081008 >= 20020515` -> **PASS**.
   - User born `20100920` (age 16) -> `20081008 >= 20100920` -> **FAIL**.

---

## 3. STEP-BY-STEP ACTION PLAN FOR THE AGENT

### Step 1: Dependencies Setup
Inside `/circuits`:
```bash
npm init -y
npm install circomlib snarkjs
```

### Step 2: Implement Circuit
Create `circuits/age_check.circom` incorporating the exact templates, signals, and imports specified above.

### Step 3: Write Automated Build Script (`compile.sh`)
Create an executable script `circuits/compile.sh` performing:
1. Circuit compilation:
   ```bash
   circom age_check.circom --r1cs --wasm --sym -o build/
   ```
2. Groth16 Trusted Setup (Powers of Tau + Phase 2):
   ```bash
   # Download or generate pot12 (sufficient for ~2,000 constraints)
   npx snarkjs powersoftau new bn128 12 build/pot12_0000.ptau -v
   npx snarkjs powersoftau contribute build/pot12_0000.ptau build/pot12_0001.ptau --name="Init" -v -e="entropy1"
   npx snarkjs powersoftau prepare phase2 build/pot12_0001.ptau build/pot12_final.ptau -v

   # Groth16 ceremony
   npx snarkjs groth16 setup build/age_check.r1cs build/pot12_final.ptau build/age_check_0000.zkey
   npx snarkjs zkey contribute build/age_check_0000.zkey build/age_check_final.zkey --name="Dev" -v -e="entropy2"
   npx snarkjs zkey export verificationkey build/age_check_final.zkey build/verification_key.json
   ```
3. Artifact Distribution:
   ```bash
   mkdir -p ../client/public ../verifier
   cp build/age_check_js/age_check.wasm ../client/public/
   cp build/age_check_final.zkey ../client/public/
   cp build/verification_key.json ../verifier/
   ```

### Step 4: Circuit Test Script
Create `circuits/test/circuit.test.js`:
- Test Case A: Valid adult (e.g. birthDate `20020515`, currentDate `20261008`, ageLimit 18) -> witness generation succeeds.
- Test Case B: Minor (e.g. birthDate `20100920`, currentDate `20261008`, ageLimit 18) -> witness generation fails (`Assert Failed`).
- Test Case C: Invalid signature -> witness generation fails.

---

## 4. GUARDRAILS FOR THE AGENT
1. **NO GIT COMMANDS**: Do not run `git add`, `git commit`, `git push`, etc.
2. **STRICT SCOPE**: Primary work in `/circuits`. Only copy final build artifacts (`.wasm`, `.zkey`, `verification_key.json`) to `client/public/` and `verifier/`. Do NOT modify other source code in `/client`.
3. **DO NOT CHANGE SIGNAL NAMES**: The circuit uses **full date** signals — not year-only. The exact names expected by `client/src/prover.js` are: `currentDate`, `ageLimit`, `pubKeyX`, `pubKeyY`, `birthDate`, `r8x`, `r8y`, `s`. Using `birthYear` or `currentYear` instead will break proof generation.
