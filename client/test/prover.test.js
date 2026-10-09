import assert from 'node:assert/strict';
import { toCircomSignal, formatCircuitInputs, normalizeDateToNumber } from '../src/prover.js';

console.log('Running tests for client/src/prover.js (date support)...');

// Test 1: Date normalization
assert.equal(normalizeDateToNumber('2004-05-15'), 20040515);
assert.equal(normalizeDateToNumber('20040515'), 20040515);
assert.equal(normalizeDateToNumber(new Date(2026, 9, 8)), 20261008);
console.log('✓ normalizeDateToNumber tests passed');

// Test 2: toCircomSignal conversion
assert.equal(toCircomSignal(2000), '2000');
assert.equal(toCircomSignal(2000n), '2000');
assert.equal(toCircomSignal('0x12'), '18');
assert.equal(toCircomSignal('2000-05-12'), '20000512');
assert.deepEqual(toCircomSignal(['2000-01-01', '0x20']), ['20000101', '32']);
console.log('✓ toCircomSignal date tests passed');

// Test 3: formatCircuitInputs with full birthDate
const testCred = {
  holderName: 'Alice',
  birthDate: '2002-05-15',
  signature: {
    R8x: '100',
    R8y: '200',
    S: '300'
  },
  issuerPublicKey: ['400', '500']
};

const formatted = formatCircuitInputs(testCred, '2026-10-08', 18);
assert.equal(formatted.currentDate, '20261008');
assert.equal(formatted.currentYear, '2026');
assert.equal(formatted.currentMonth, '10');
assert.equal(formatted.currentDay, '8');
assert.equal(formatted.birthDate, '20020515');
assert.equal(formatted.birthYear, '2002');
assert.equal(formatted.birthMonth, '5');
assert.equal(formatted.birthDay, '15');
assert.equal(formatted.ageLimit, '18');
assert.equal(formatted.r8x, '100');
assert.equal(formatted.r8y, '200');
assert.equal(formatted.s, '300');
assert.equal(formatted.pubKeyX, '400');
assert.equal(formatted.pubKeyY, '500');
// Verify metadata and arrays are not leaked into circuit input signals
assert.equal(formatted.issuerPublicKey, undefined);
assert.equal(formatted.holderName, undefined);
console.log('✓ formatCircuitInputs date tests and array exclusion passed');

// Test 4: End-to-end generateProof with circuit artifacts
const fs = await import('node:fs');
const path = await import('node:path');
const { generateProof } = await import('../src/prover.js');

const wasmPath = path.resolve('public/age.wasm');
const zkeyPath = path.resolve('public/age_final.zkey');

if (fs.existsSync(wasmPath) && fs.existsSync(zkeyPath)) {
  const wasmBuf = fs.readFileSync(wasmPath);
  const zkeyBuf = fs.readFileSync(zkeyPath);

  globalThis.fetch = async (url) => {
    const buf = url.includes('.wasm') ? wasmBuf : zkeyBuf;
    return {
      ok: true,
      headers: { get: () => 'application/octet-stream' },
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    };
  };

  const proofResult = await generateProof(testCred, '2026-10-09', 18);
  assert.ok(proofResult.proof, 'Proof object should be generated');
  assert.ok(Array.isArray(proofResult.publicSignals), 'Public signals should be an array');
  console.log('✓ generateProof end-to-end test passed');
}

console.log('All prover module unit tests passed successfully!');
