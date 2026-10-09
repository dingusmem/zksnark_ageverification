# Circuit Artifacts Directory (/client/public)

This directory serves static assets at the root path for browser fetching (`/age_check.wasm` and `/age_check_final.zkey`).

## Required Files:
1. `age_check.wasm`: Compiled Circom WebAssembly witness generator
2. `age_check_final.zkey`: Proving key generated from Groth16 trusted setup

## Automated Build / Placement:
Once the `/circuits` module compiles the circuit:
```bash
cp ../circuits/build/age_check_js/age_check.wasm ./
cp ../circuits/build/age_check_final.zkey ./
```
The client prover (`prover.js`) will automatically detect these assets and execute full Groth16 zero-knowledge proofs.
