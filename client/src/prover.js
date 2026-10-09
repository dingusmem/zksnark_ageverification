/**
 * /client/src/prover.js
 *
 * Browser-side zk-SNARK proof generation module using snarkjs (Groth16).
 * Handles asset loading, full-date signal formatting (YYYYMMDD), and proof execution.
 *
 * CIRCUIT_MODE controls which compiled circuit artifact is targeted:
 *
 *   'simple'  — The current circuit (age.circom) which uses full date comparison.
 *               Signals: { birthYear, birthMonth, birthDay, currentYear, currentMonth, currentDay, minimumAge }
 *               Assets:  age.wasm / age_final.zkey
 *               NOTE: No signature verification. Uses separate year/month/day signals.
 *
 *   'full'    — The intended final circuit (age_check.circom) with YYYYMMDD dates
 *               and EdDSA signature verification.
 *               Signals: { birthDate, currentDate, ageLimit, pubKeyX, pubKeyY, r8x, r8y, s }
 *               Assets:  age_check.wasm / age_check_final.zkey
 *               Switch to this once the circuits engineer delivers the upgraded circuit.
 */
export const CIRCUIT_MODE = 'simple'; // <-- change to 'full' when upgraded circuit is ready

import * as snarkjs from "snarkjs";

// In-memory cache for binary assets to avoid redundant network requests across proof runs
let cachedWasm = null;
let cachedZkey = null;

/**
 * Checks if a byte buffer starts with the WebAssembly magic header: \0asm (0x00, 0x61, 0x73, 0x6d).
 * Detects common Vite SPA fallback errors where index.html is served for missing public files.
 * 
 * @param {Uint8Array} uint8Array
 * @returns {boolean}
 */
function isWasmBinary(uint8Array) {
  return (
    uint8Array.length >= 4 &&
    uint8Array[0] === 0x00 &&
    uint8Array[1] === 0x61 &&
    uint8Array[2] === 0x73 &&
    uint8Array[3] === 0x6d
  );
}

/**
 * Fetches a binary asset from the browser's public root with error handling and validation.
 * 
 * @param {string} url - Public path to the asset (e.g. "/age_check.wasm")
 * @returns {Promise<Uint8Array>}
 */
export async function fetchAssetBuffer(url) {
  if (typeof fetch !== "function") {
    throw new Error("fetch() is not available. Ensure this code executes in a browser environment.");
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to load asset "${url}" (HTTP ${response.status} ${response.statusText}). ` +
      `Ensure compiled circuit artifacts are placed inside /client/public/.`
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    throw new Error(
      `Received HTML instead of binary data when fetching "${url}". ` +
      `This typically indicates Vite's SPA fallback served index.html for a missing asset. ` +
      `Check that the file exists in /client/public${url.startsWith("/") ? url : "/" + url}.`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  if (url.endsWith(".wasm") && !isWasmBinary(uint8Array)) {
    throw new Error(
      `The file at "${url}" is not a valid WebAssembly binary (magic header mismatch).`
    );
  }

  return uint8Array;
}

/**
 * Clears the in-memory cache of WASM and zkey binary buffers.
 */
export function clearAssetCache() {
  cachedWasm = null;
  cachedZkey = null;
}

/**
 * Normalizes a date representation (Date object, ISO string 'YYYY-MM-DD', or integer YYYYMMDD)
 * to an integer in YYYYMMDD format.
 * 
 * @param {Date|string|number|bigint} dateInput
 * @returns {number} Integer representation e.g. 20040515
 */
export function normalizeDateToNumber(dateInput) {
  if (dateInput === null || dateInput === undefined) {
    throw new Error(`Cannot normalize null/undefined date.`);
  }

  if (dateInput instanceof Date) {
    const y = dateInput.getFullYear();
    const m = String(dateInput.getMonth() + 1).padStart(2, '0');
    const d = String(dateInput.getDate()).padStart(2, '0');
    return parseInt(`${y}${m}${d}`, 10);
  }

  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    // ISO date format: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return parseInt(trimmed.slice(0, 10).replace(/-/g, ''), 10);
    }
    // Numeric 8-digit date string: YYYYMMDD
    if (/^\d{8}$/.test(trimmed)) {
      return parseInt(trimmed, 10);
    }
    // If only 4-digit year given: YYYY -> default to YYYY0101
    if (/^\d{4}$/.test(trimmed)) {
      return parseInt(`${trimmed}0101`, 10);
    }
  }

  if (typeof dateInput === 'number') {
    // 4-digit year number -> default to YYYY0101
    if (dateInput >= 1900 && dateInput <= 2200) {
      return dateInput * 10000 + 101;
    }
    return Math.floor(dateInput);
  }

  if (typeof dateInput === 'bigint') {
    const num = Number(dateInput);
    if (num >= 1900 && num <= 2200) {
      return num * 10000 + 101;
    }
    return num;
  }

  throw new Error(`Cannot parse "${dateInput}" into a valid date integer.`);
}

/**
 * Converts numbers, BigInts, hex strings, or date strings into Circom-compatible decimal string signals.
 * Full dates (e.g. "2002-05-15") are converted to their decimal integer representation ("20020515").
 * 
 * @param {number|bigint|string|Date} value
 * @returns {string}
 */
export function toCircomSignal(value) {
  if (value === null || value === undefined) {
    throw new Error(`Cannot convert ${value} to a Circom signal.`);
  }

  if (value instanceof Date) {
    return normalizeDateToNumber(value).toString();
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid numeric signal: ${value}`);
    }
    return Math.floor(value).toString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    // ISO Date string (e.g. "2002-05-15") -> convert to "20020515"
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return normalizeDateToNumber(trimmed).toString();
    }

    // Hex string (e.g. "0x123abc")
    if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
      return BigInt(trimmed).toString();
    }

    // Decimal string
    if (/^-?\d+$/.test(trimmed)) {
      return BigInt(trimmed).toString();
    }

    // Generic BigInt parse attempt
    try {
      return BigInt(trimmed).toString();
    } catch {
      throw new Error(`Cannot parse string "${value}" into a Circom numeric signal.`);
    }
  }

  if (Array.isArray(value)) {
    return value.map(toCircomSignal);
  }

  throw new Error(`Unsupported signal value type: ${typeof value}`);
}

/**
 * Formats a raw signed credential and parameters into Circom circuit input signals.
 * Converts full dates into YYYYMMDD integers.
 * 
 * @param {Object} signedCredential
 * @param {Date|string|number} currentDate - e.g. "2026-10-08" or 20261008
 * @param {number|string|bigint} ageLimit - e.g. 18
 * @returns {Object} Formatted circuit inputs
 */
export function formatCircuitInputs(signedCredential, currentDate, ageLimit) {
  if (!signedCredential || typeof signedCredential !== "object") {
    throw new Error("signedCredential must be a valid object.");
  }

  const inputs = {};

  // 1. Mandatory public signals: currentDate (YYYYMMDD) and ageLimit
  const dateVal = currentDate !== undefined && currentDate !== null ? currentDate : new Date();
  const curDateNum = normalizeDateToNumber(dateVal);
  inputs.currentDate = curDateNum.toString();
  inputs.currentYear = Math.floor(curDateNum / 10000).toString(); // Backwards compatibility
  inputs.currentMonth = Math.floor((curDateNum % 10000) / 100).toString();
  inputs.currentDay = (curDateNum % 100).toString();
  inputs.ageLimit = toCircomSignal(ageLimit);
  inputs.minimumAge = toCircomSignal(ageLimit);

  // 2. Extract birthDate from credential or credentialSubject
  const subject = signedCredential.credentialSubject || signedCredential.credential || signedCredential;
  const rawBirth =
    subject.birthDate ??
    subject.dob ??
    subject.dateOfBirth ??
    subject.birth_date ??
    subject.birthYear ??
    subject.yearOfBirth;

  if (rawBirth !== undefined && rawBirth !== null) {
    const birthNum = normalizeDateToNumber(rawBirth);
    inputs.birthDate = birthNum.toString();
    inputs.birthYear = Math.floor(birthNum / 10000).toString(); // Backwards compatibility
    inputs.birthMonth = Math.floor((birthNum % 10000) / 100).toString();
    inputs.birthDay = (birthNum % 100).toString();
  }

  // 3. Extract and format signature components
  const sig = signedCredential.signature ?? signedCredential.sig;
  if (sig) {
    if (Array.isArray(sig)) {
      if (sig.length >= 3) {
        inputs.r8x = toCircomSignal(sig[0]);
        inputs.r8y = toCircomSignal(sig[1]);
        inputs.s = toCircomSignal(sig[2]);
      }
    } else if (typeof sig === "object") {
      if (sig.R8x !== undefined && sig.R8y !== undefined) {
        inputs.r8x = toCircomSignal(sig.R8x);
        inputs.r8y = toCircomSignal(sig.R8y);
      } else if (Array.isArray(sig.r8) && sig.r8.length >= 2) {
        inputs.r8x = toCircomSignal(sig.r8[0]);
        inputs.r8y = toCircomSignal(sig.r8[1]);
      }
      if (sig.S !== undefined || sig.s !== undefined) {
        inputs.s = toCircomSignal(sig.S ?? sig.s);
      }
    }
  }

  // 4. Extract and format issuer public key
  const pubKey = signedCredential.issuerPublicKey ?? signedCredential.issuerPubKey ?? signedCredential.pubKey;
  if (pubKey) {
    if (Array.isArray(pubKey)) {
      if (pubKey.length >= 2) {
        inputs.pubKeyX = toCircomSignal(pubKey[0]);
        inputs.pubKeyY = toCircomSignal(pubKey[1]);
      }
    } else if (typeof pubKey === "object") {
      if (pubKey.x !== undefined && pubKey.y !== undefined) {
        inputs.pubKeyX = toCircomSignal(pubKey.x);
        inputs.pubKeyY = toCircomSignal(pubKey.y);
      }
    }
  }

  // 5. Convert any explicit top-level fields not yet processed (excluding metadata and complex objects)
  const excludedKeys = [
    "signature", "sig", "credentialSubject", "credential",
    "issuerPublicKey", "issuerPubKey", "pubKey",
    "holderName", "documentId", "issuer", "name"
  ];
  for (const [key, val] of Object.entries(signedCredential)) {
    if (excludedKeys.includes(key)) {
      continue;
    }
    if (!(key in inputs)) {
      try {
        if (Array.isArray(val)) {
          inputs[key] = val.map(toCircomSignal);
        } else if (typeof val === "object" && val !== null) {
          for (const [nestedKey, nestedVal] of Object.entries(val)) {
            if (!(nestedKey in inputs) && !excludedKeys.includes(nestedKey)) {
              try {
                inputs[nestedKey] = toCircomSignal(nestedVal);
              } catch {
                // Ignore nested non-signal objects
              }
            }
          }
        } else {
          inputs[key] = toCircomSignal(val);
        }
      } catch {
        // Skip non-signal metadata
      }
    }
  }

  return inputs;
}

/**
 * Generates a Groth16 zero-knowledge proof for age verification using full dates.
 * 
 * @param {Object} signedCredential - The issuer-signed credential object
 * @param {Date|string|number} currentDate - Current date (e.g. "2026-10-08" or new Date())
 * @param {number|string|bigint} ageLimit - Age requirement threshold (e.g. 18 or 21)
 * @param {Object} [options] - Prover options
 * @param {string} [options.wasmUrl="/age_check.wasm"] - Path or URL to circuit WASM binary
 * @param {string} [options.zkeyUrl="/age_check_final.zkey"] - Path or URL to Groth16 zkey
 * @param {boolean} [options.reloadAssets=false] - If true, bypasses in-memory asset cache
 * @returns {Promise<{ proof: Object, publicSignals: Array<string> }>}
 */
export async function generateProof(
  signedCredential,
  currentDate = new Date(),
  ageLimit = 18,
  options = {}
) {
  // Asset paths depend on which circuit is compiled
  const defaultWasm = CIRCUIT_MODE === 'full' ? '/age_check.wasm' : '/age.wasm';
  const defaultZkey = CIRCUIT_MODE === 'full' ? '/age_check_final.zkey' : '/age_final.zkey';
  const wasmUrl = options.wasmUrl || defaultWasm;
  const zkeyUrl = options.zkeyUrl || defaultZkey;

  // Build circuit inputs matching the compiled circuit's declared signals
  let circuitInputs;
  if (CIRCUIT_MODE === 'full') {
    // Full circuit: YYYYMMDD dates + EdDSA signature verification
    circuitInputs = formatCircuitInputs(signedCredential, currentDate, ageLimit);
  } else {
    // Simple circuit: full date (year/month/day), no signature.
    // Signals: birthYear, birthMonth, birthDay, currentYear, currentMonth, currentDay, minimumAge
    const dateVal = currentDate !== undefined && currentDate !== null ? currentDate : new Date();
    const curDateNum = normalizeDateToNumber(dateVal);
    const subject = signedCredential.credentialSubject || signedCredential.credential || signedCredential;
    const rawBirth = subject.birthDate ?? subject.dob ?? subject.dateOfBirth ?? subject.birth_date ?? subject.birthYear ?? subject.yearOfBirth;
    const birthDateNum = normalizeDateToNumber(rawBirth);

    // Decompose YYYYMMDD integer into year / month / day components
    const birthYear  = Math.floor(birthDateNum / 10000);
    const birthMonth = Math.floor((birthDateNum % 10000) / 100);
    const birthDay   = birthDateNum % 100;

    const currentYear  = Math.floor(curDateNum / 10000);
    const currentMonth = Math.floor((curDateNum % 10000) / 100);
    const currentDay   = curDateNum % 100;

    circuitInputs = {
      birthYear:    birthYear,
      birthMonth:   birthMonth,
      birthDay:     birthDay,
      currentYear:  currentYear,
      currentMonth: currentMonth,
      currentDay:   currentDay,
      minimumAge:   Number(ageLimit)
    };
  }

  // Fetch and cache circuit binary assets
  if (!cachedWasm || options.reloadAssets) {
    cachedWasm = await fetchAssetBuffer(wasmUrl);
  }
  if (!cachedZkey || options.reloadAssets) {
    cachedZkey = await fetchAssetBuffer(zkeyUrl);
  }

  // Resolve snarkjs Groth16 instance
  const groth16 = snarkjs?.groth16 || (typeof window !== 'undefined' && window?.snarkjs?.groth16);
  if (!groth16) {
    throw new Error(
      "snarkjs.groth16 is not available. Ensure 'snarkjs' is installed in package.json or loaded in index.html."
    );
  }

  // Generate Groth16 proof
  try {
    const { proof, publicSignals } = await groth16.fullProve(
      circuitInputs,
      cachedWasm,
      cachedZkey
    );
    return { proof, publicSignals };
  } catch (err) {
    if (err.message && err.message.includes('Too many values for input signal')) {
      // If the compiled wasm artifact is still the legacy 3-signal circuit (year-only inputs),
      // adapt by providing the 3 legacy signals { birthYear, currentYear, minimumAge }
      if (
        circuitInputs.birthYear !== undefined &&
        circuitInputs.currentYear !== undefined &&
        (circuitInputs.minimumAge !== undefined || circuitInputs.ageLimit !== undefined)
      ) {
        try {
          const legacyInputs = {
            birthYear: String(circuitInputs.birthYear),
            currentYear: String(circuitInputs.currentYear),
            minimumAge: String(circuitInputs.minimumAge ?? circuitInputs.ageLimit)
          };
          const { proof, publicSignals } = await groth16.fullProve(
            legacyInputs,
            cachedWasm,
            cachedZkey
          );
          return { proof, publicSignals };
        } catch {
          // If legacy retry fails, proceed to normal error handling
        }
      }
    }
    if (err.message && err.message.includes('Assert Failed')) {
      throw new Error(
        `ZK Proof generation failed: Constraint assertion violated. ` +
        `The credential does not meet the age requirement or (in full mode) contains an invalid signature.`
      );
    }
    throw new Error(`Failed to generate ZK proof: ${err.message || err}`);
  }
}
