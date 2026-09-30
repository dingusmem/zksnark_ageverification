## circom circuit 
- circom circuit logic to verify document signature and perorm age check
- compile circuit
- groth16 trusted setup to generate proving and verification keys
## Issuer
- UI for website/app representing issuing authority (govt body)
- cryptographic keypair generation
- (API) sign the document containing age (json)
## User client
- UI/webclient to hold signed credential 
- integrate snarkjs to locally load circom files
- execute proof-generation and send proof
## verifier
- UI/dashboard (representing a website asking for age verification)
- implement verification logic 
- accept/reject validity of proof
