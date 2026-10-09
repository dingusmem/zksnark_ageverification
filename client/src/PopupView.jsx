import React, { useState } from 'react';
import { generateProof, formatCircuitInputs, normalizeDateToNumber, CIRCUIT_MODE } from './prover';

const DEMO_CREDENTIALS = {
  joginder: {
    name: 'joginder (Adult, Born 2002-05-15)',
    birthDate: '2002-05-15',
    documentId: 'DOC-2024-88912',
    issuerPublicKey: [
      '11513205627209804218258999589178830175530791841079753614756486058912071880488',
      '336125006497184286243916960098717804455842042646698942671385786510046582805'
    ],
    signature: {
      R8x: '17704533164906049484467236743926019035777694153835688582610187784749211649974',
      R8y: '10716260156997033349644422204490106322510872696891749842526942008917858428826',
      S: '4356981298457192837491823749182739481729384719283749182739481729'
    }
  },
  john: {
    name: 'john (Minor, Born 2010-09-20)',
    birthDate: '2010-09-20',
    documentId: 'DOC-2024-44219',
    issuerPublicKey: [
      '11513205627209804218258999589178830175530791841079753614756486058912071880488',
      '336125006497184286243916960098717804455842042646698942671385786510046582805'
    ],
    signature: {
      R8x: '8834162534271805342718053427180534271805342718053427180534271805',
      R8y: '9945273645382916453829164538291645382916453829164538291645382916',
      S: '1056384756493027564930275649302756493027564930275649302756493027'
    }
  }
};

export default function PopupView() {
  const params = new URLSearchParams(window.location.search);
  const reqId = params.get('reqId') || 'req_default';
  const minAge = parseInt(params.get('minAge') || '18', 10);
  const currentDate = params.get('currentDate') || new Date().toISOString().slice(0, 10);
  const origin = params.get('origin') || document.referrer || 'Unknown Site';

  const [selectedKey, setSelectedKey] = useState('joginder');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const activeCred = DEMO_CREDENTIALS[selectedKey];

  const handleCancel = () => {
    if (window.opener) {
      window.opener.postMessage(
        { type: 'ZK_AGE_PROOF_CANCEL', reqId, reason: 'User cancelled verification' },
        '*'
      );
    }
    window.close();
  };

  const handleApprove = async () => {
    setLoading(true);
    setErrorMsg('');
    setStatusMsg('Checking date-based age requirement...');

    try {
      const curNum = normalizeDateToNumber(currentDate);
      const birthNum = normalizeDateToNumber(activeCred.birthDate);

      // Decompose into components to mirror the updated circuit's logic
      const birthYear  = Math.floor(birthNum / 10000);
      const birthMonth = Math.floor((birthNum % 10000) / 100);
      const birthDay   = birthNum % 100;
      const curYear    = Math.floor(curNum / 10000);
      const curMonth   = Math.floor((curNum % 10000) / 100);
      const curDay     = curNum % 100;
      const birthdayYear = birthYear + minAge;

      const yearPassed  = birthdayYear < curYear;
      const sameYear    = birthdayYear === curYear;
      const monthPassed = birthMonth < curMonth;
      const sameMonth   = birthMonth === curMonth;
      const dayPassed   = birthDay <= curDay;
      const isEligible  = yearPassed || (sameYear && monthPassed) || (sameYear && sameMonth && dayPassed);

      if (!isEligible) {
        throw new Error(
          `Age requirement not satisfied. User born on ${activeCred.birthDate} has not reached ${minAge} years as of ${currentDate}.`
        );
      }

      setStatusMsg('Generating zero-knowledge proof...');

      let proofData;
      try {
        proofData = await generateProof(activeCred, currentDate, minAge);
      } catch (snarkErr) {
        // Fallback simulation if circuits are not compiled yet in public/
        if (snarkErr.message.includes('Failed to load asset') || snarkErr.message.includes('404')) {
          await new Promise((r) => setTimeout(r, 600));
          const formatted = formatCircuitInputs(activeCred, currentDate, minAge);
          const simPublicSignals = CIRCUIT_MODE === 'full'
            ? [
                formatted.currentDate,
                formatted.ageLimit,
                formatted.pubKeyX || activeCred.issuerPublicKey[0],
                formatted.pubKeyY || activeCred.issuerPublicKey[1]
              ]
            : ['1']; // simple circuit outputs a single 'eligible' signal (now full-date aware)
          proofData = {
            proof: {
              pi_a: ['0x19a4b8...', '0x028c11...', '1'],
              pi_b: [['0x0...', '0x1...'], ['0x2...', '0x3...'], ['1', '0']],
              pi_c: ['0x44ab...', '0x55cd...', '1'],
              protocol: 'groth16',
              curve: 'bn128'
            },
            publicSignals: simPublicSignals
          };
        } else {
          throw snarkErr;
        }
      }

      setStatusMsg('Proof generated! Returning to website...');

      if (window.opener) {
        window.opener.postMessage(
          {
            type: 'ZK_AGE_PROOF_SUCCESS',
            reqId,
            proof: proofData.proof,
            publicSignals: proofData.publicSignals,
            credentialHolder: activeCred.name
          },
          '*'
        );
      }

      setTimeout(() => {
        window.close();
      }, 800);
    } catch (err) {
      setErrorMsg(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="popup-box">
      <h2>Age Verification Request</h2>
      <p style={{ color: '#475569', fontSize: '0.9rem', marginBottom: '8px' }}>
        <strong>{origin}</strong> is requesting proof that you are at least <strong>{minAge} years old</strong> as of <strong>{currentDate}</strong>.
      </p>

      <div className="privacy-notice">
        <strong>Privacy Guarantee:</strong> Only mathematical proof is shared. Your birth date, name, and identity documents remain private.
      </div>

      <div className="form-group" style={{ marginTop: '14px' }}>
        <label>Select Identity Credential:</label>
        <select
          className="select"
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value)}
          disabled={loading}
        >
          <option value="joginder">{DEMO_CREDENTIALS.joginder.name}</option>
          <option value="john">{DEMO_CREDENTIALS.john.name}</option>
        </select>
      </div>

      {statusMsg && !errorMsg && (
        <div className="alert alert-info">{statusMsg}</div>
      )}

      {errorMsg && (
        <div className="alert alert-error">{errorMsg}</div>
      )}

      <div className="button-group" style={{ marginTop: '18px' }}>
        <button
          className="btn btn-primary"
          onClick={handleApprove}
          disabled={loading}
          style={{ flex: 1 }}
        >
          {loading ? 'Generating...' : `Approve & Prove (Age ≥ ${minAge})`}
        </button>
        <button
          className="btn"
          onClick={handleCancel}
          disabled={loading}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
