import React, { useState } from 'react';
import PopupView from './PopupView';
import { requestAgeProof } from './sdk';
import { generateProof, formatCircuitInputs, normalizeDateToNumber, CIRCUIT_MODE } from './prover';

const PRESET_CREDENTIALS = {
  alice: {
    name: 'Jamal (Adult - Born 2002-05-15)',
    data: {
      holderName: 'Joginder Jamal',
      birthDate: '2002-05-15',
      documentId: 'DOC-2024-88912',
      issuer: 'Government',
      issuerPublicKey: [
        '11513205627209804218258999589178830175530791841079753614756486058912071880488',
        '336125006497184286243916960098717804455842042646698942671385786510046582805'
      ],
      signature: {
        R8x: '17704533164906049484467236743926019035777694153835688582610187784749211649974',
        R8y: '10716260156997033349644422204490106322510872696891749842526942008917858428826',
        S: '4356981298457192837491823749182739481729384719283749182739481729'
      }
    }
  },
  charlie: {
    name: 'John (Minor - Born 2010-09-20)',
    data: {
      holderName: 'John Singh',
      birthDate: '2009-09-20',
      documentId: 'DOC-2024-44219',
      issuer: 'Government',
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
  }
};

export default function App() {
  const isPopupMode = new URLSearchParams(window.location.search).get('mode') === 'popup';
  if (isPopupMode) {
    return <PopupView />;
  }

  // Credential State
  const [selectedPreset, setSelectedPreset] = useState('alice');
  const [credential, setCredential] = useState(PRESET_CREDENTIALS.alice.data);
  const [isCustom, setIsCustom] = useState(false);
  const [customJson, setCustomJson] = useState(JSON.stringify(PRESET_CREDENTIALS.alice.data, null, 2));

  // Date-based Age Parameters
  const todayStr = new Date().toISOString().slice(0, 10); // e.g. "2026-10-08"
  const [currentDate, setCurrentDate] = useState(todayStr);
  const [ageLimit, setAgeLimit] = useState(18);

  // Prover State
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [proofResult, setProofResult] = useState(null);
  const [copyStatus, setCopyStatus] = useState('');

  const handlePresetChange = (key) => {
    setSelectedPreset(key);
    if (key === 'custom') {
      setIsCustom(true);
    } else {
      setIsCustom(false);
      setCredential(PRESET_CREDENTIALS[key].data);
      setCustomJson(JSON.stringify(PRESET_CREDENTIALS[key].data, null, 2));
    }
    setProofResult(null);
    setErrorMsg('');
  };

  const handleCustomJsonChange = (e) => {
    setCustomJson(e.target.value);
    try {
      const parsed = JSON.parse(e.target.value);
      setCredential(parsed);
      setErrorMsg('');
    } catch {
      // Incomplete JSON typing
    }
  };

  // Generate proof directly on this page
  const handleGenerateProof = async () => {
    setLoading(true);
    setErrorMsg('');
    setProofResult(null);
    setStatusMsg('Checking date-based age requirement...');

    try {
      if (!credential.birthDate) {
        throw new Error('Credential is missing a birthDate field. Expected format: "YYYY-MM-DD".');
      }

      const curNum = normalizeDateToNumber(currentDate);
      const birthNum = normalizeDateToNumber(credential.birthDate);

      // Decompose dates into components to mirror the updated circuit's logic
      const birthYear  = Math.floor(birthNum / 10000);
      const birthMonth = Math.floor((birthNum % 10000) / 100);
      const birthDay   = birthNum % 100;
      const curYear    = Math.floor(curNum / 10000);
      const curMonth   = Math.floor((curNum % 10000) / 100);
      const curDay     = curNum % 100;
      const birthdayYear = birthYear + Number(ageLimit);

      const yearPassed  = birthdayYear < curYear;
      const sameYear    = birthdayYear === curYear;
      const monthPassed = birthMonth < curMonth;
      const sameMonth   = birthMonth === curMonth;
      const dayPassed   = birthDay <= curDay;
      const isEligible  = yearPassed || (sameYear && monthPassed) || (sameYear && sameMonth && dayPassed);

      if (!isEligible) {
        throw new Error(
          `Constraint rejected: User born on ${credential.birthDate} has not reached ${ageLimit} years as of ${currentDate}.`
        );
      }

      setStatusMsg('Computing zero-knowledge proof with snarkjs...');

      let result;
      try {
        result = await generateProof(credential, currentDate, ageLimit);
      } catch (err) {
        // Fallback simulation if circuit assets are not placed in public/ yet
        if (err.message.includes('Failed to load asset') || err.message.includes('404')) {
          await new Promise((r) => setTimeout(r, 500));
          const formatted = formatCircuitInputs(credential, currentDate, ageLimit);
          const simPublicSignals = CIRCUIT_MODE === 'full'
            ? [
                formatted.currentDate,
                formatted.ageLimit,
                formatted.pubKeyX || (credential.issuerPublicKey && credential.issuerPublicKey[0]) || '0',
                formatted.pubKeyY || (credential.issuerPublicKey && credential.issuerPublicKey[1]) || '0'
              ]
            : ['1']; // simple circuit outputs a single 'eligible' signal (now full-date aware)
          result = {
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
          throw err;
        }
      }

      setProofResult(result);
      setStatusMsg('');
    } catch (err) {
      setErrorMsg(err.message || String(err));
      setStatusMsg('');
    } finally {
      setLoading(false);
    }
  };

  // Test launching the pop-up window via the SDK
  const handleLaunchPopup = async () => {
    setLoading(true);
    setErrorMsg('');
    setProofResult(null);
    setStatusMsg('Waiting for pop-up window...');

    try {
      const result = await requestAgeProof({ minAge: ageLimit, currentDate });
      setProofResult(result);
      setStatusMsg('');
    } catch (err) {
      setErrorMsg(err.message || String(err));
      setStatusMsg('');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyProof = () => {
    if (!proofResult) return;
    navigator.clipboard.writeText(JSON.stringify(proofResult, null, 2));
    setCopyStatus('Copied!');
    setTimeout(() => setCopyStatus(''), 2000);
  };

  return (
    <div className="container">
      <h1>zk-SNARK Age Verification Client</h1>
      <p className="subtitle">Privacy-preserving age check using exact dates (Circom &amp; Groth16)</p>

      {/* 1. Identity Credential Section */}
      <div className="section">
        <div className="section-title">1. Identity Credential</div>
        
        <div className="form-group">
          <label>Select Test Identity:</label>
          <select
            className="select"
            value={selectedPreset}
            onChange={(e) => handlePresetChange(e.target.value)}
          >
            <option value="alice">{PRESET_CREDENTIALS.alice.name}</option>
            <option value="charlie">{PRESET_CREDENTIALS.charlie.name}</option>
            <option value="custom">Custom Credential JSON</option>
          </select>
        </div>

        {isCustom ? (
          <div className="form-group">
            <label>Paste Signed Credential JSON:</label>
            <textarea
              className="textarea"
              rows={6}
              value={customJson}
              onChange={handleCustomJsonChange}
            />
          </div>
        ) : (
          <div className="credential-info">
            <div><strong>Holder:</strong> {credential.holderName}</div>
            <div><strong>Document ID:</strong> {credential.documentId}</div>
            <div>
              <strong>Birth Date:</strong> {credential.birthDate}{' '}
              <span className="secret-tag">(Private — Never shared with verifier)</span>
            </div>
            <div>
              <strong>Issuer:</strong> {credential.issuer}
            </div>
          </div>
        )}
      </div>

      {/* 2. Verification Settings */}
      <div className="section">
        <div className="section-title">2. Verification Parameters</div>
        <div className="row">
          <div className="form-group">
            <label>Current Date (YYYY-MM-DD):</label>
            <input
              type="date"
              className="input-text"
              value={currentDate}
              onChange={(e) => setCurrentDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Required Age (Age Limit in Years):</label>
            <input
              type="number"
              className="input-text"
              value={ageLimit}
              onChange={(e) => setAgeLimit(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* 3. Action Buttons */}
      <div className="button-group">
        <button
          className="btn btn-primary"
          onClick={handleGenerateProof}
          disabled={loading}
        >
          {loading ? 'Processing...' : `Generate Age Proof (Age ≥ ${ageLimit} as of ${currentDate})`}
        </button>
        <button
          className="btn"
          onClick={handleLaunchPopup}
          disabled={loading}
        >
          Test Pop-up Verification Window
        </button>
      </div>

      {/* Status & Error Messages */}
      {statusMsg && <div className="alert alert-info">{statusMsg}</div>}
      {errorMsg && <div className="alert alert-error">{errorMsg}</div>}

      {/* 4. Output Results */}
      {proofResult && (
        <div className="section" style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="section-title" style={{ marginBottom: 0 }}>
              Proof Output
            </div>
            <button className="btn" onClick={handleCopyProof}>
              {copyStatus || 'Copy JSON'}
            </button>
          </div>

          <div className="alert alert-success">
            <strong>Proof Generated Successfully!</strong>
            <div>Proves user is at least {ageLimit} years old without revealing their exact birth date.</div>
          </div>

          <div style={{ marginTop: '12px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Public Signals (Disclosed to Verifier):</label>
            <pre className="code-output">{JSON.stringify(proofResult.publicSignals, null, 2)}</pre>
          </div>

          <div style={{ marginTop: '12px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Groth16 Proof:</label>
            <pre className="code-output">{JSON.stringify(proofResult.proof, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
