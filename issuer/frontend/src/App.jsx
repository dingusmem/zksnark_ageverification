import { useEffect, useMemo, useState } from "react";

const API_BASE = "http://localhost:3001/api/issuer";

const initialFormState = {
  dateOfBirth: "2005-05-07",
};

function SectionCard({ title, subtitle, children, className = "" }) {
  return (
    <section className={`panel ${className}`.trim()}>
      <div className="section-heading">
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ActionButton({ children, onClick, variant = "primary", disabled = false, type = "button" }) {
  return (
    <button
      type={type}
      className={`action-button ${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>;
}

async function apiRequest(endpoint, method = "GET", payload = null) {
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (payload !== null && payload !== undefined) {
    options.body = JSON.stringify(payload);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function App() {
  const [health, setHealth] = useState({ status: "loading" });
  const [publicKeyHex, setPublicKeyHex] = useState("");
  const [formData, setFormData] = useState(initialFormState);
  const [formErrors, setFormErrors] = useState({});
  const [issueLoading, setIssueLoading] = useState(false);
  const [keyLoading, setKeyLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [credential, setCredential] = useState(null);
  const [signature, setSignature] = useState("");
  const [verification, setVerification] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const loadHealth = async () => {
      try {
        const data = await apiRequest("/health");
        setHealth(data);
      } catch (fetchError) {
        setError(fetchError.message);
      }

      try {
        const key = await apiRequest("/keys/current");
        setPublicKeyHex(key.publicKeyHex);
      } catch (fetchError) {
        if (!fetchError.message.includes("No active keypair")) {
          setError(fetchError.message);
        }
      }
    };

    loadHealth();
  }, []);

  const credentialPayload = useMemo(() => {
    if (!credential || !signature) return null;

    return {
      credential,
      signature,
      publicKeyHex,
      issuerKeyId: credential.issuerKeyId,
    };
  }, [credential, signature, publicKeyHex]);

  const keyReady = Boolean(publicKeyHex);

  const handleGenerateKeypair = async () => {
    setKeyLoading(true);
    setError("");
    setStatusMessage("");

    try {
      const data = await apiRequest("/keys/generate", "POST", {});
      setPublicKeyHex(data.publicKeyHex);
      setVerification(null);
      setStatusMessage("Public key generated successfully.");
    } catch (fetchError) {
      setError(fetchError.message || "Unable to generate keypair.");
    } finally {
      setKeyLoading(false);
    }
  };

  const handleCopyText = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatusMessage(`${label} copied to clipboard.`);
    } catch {
      setError(`Unable to copy ${label.toLowerCase()} automatically.`);
    }
  };

  const handleDownloadJson = () => {
    if (!credentialPayload) {
      setError("Issue a credential before downloading the JSON output.");
      return;
    }

    const blob = new Blob([JSON.stringify(credentialPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "demo-age-credential.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatusMessage("Credential JSON downloaded successfully.");
  };

  const validateForm = () => {
    const nextErrors = {};

    if (!formData.dateOfBirth) {
      nextErrors.dateOfBirth = "Date of birth is required.";
    }

    const dob = formData.dateOfBirth;
    if (dob) {
      const date = new Date(`${dob}T00:00:00Z`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (Number.isNaN(date.getTime()) || date > today) {
        nextErrors.dateOfBirth = "Please provide a valid date of birth in the past.";
      }
    }

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleIssueCredential = async (event) => {
    event.preventDefault();
    setError("");
    setStatusMessage("");

    if (!validateForm()) {
      return;
    }

    setIssueLoading(true);

    try {
      const response = await apiRequest("/credentials", "POST", {
        dateOfBirth: formData.dateOfBirth,
      });

      setCredential(response.credential);
      setSignature(response.signature);
      setPublicKeyHex(response.publicKeyHex);
      setVerification(null);
      setStatusMessage("Credential issued successfully by the authority.");

      const verificationResult = await apiRequest("/credentials/verify", "POST", {
        credential: response.credential,
        signature: response.signature,
      });

      setVerification(verificationResult);
    } catch (fetchError) {
      setError(fetchError.message || "Unable to issue credential.");
    } finally {
      setIssueLoading(false);
    }
  };

  const handleVerifyCredential = async () => {
    if (!credential || !signature || !publicKeyHex) {
      setError("Generate a keypair and issue a credential before verification.");
      return;
    }

    setVerifyLoading(true);
    setError("");
    setStatusMessage("");

    try {
      const result = await apiRequest("/credentials/verify", "POST", {
        credential,
        signature,
      });
      setVerification(result);
      setStatusMessage(result.valid ? "Credential signature verified." : "Credential signature is invalid.");
    } catch (fetchError) {
      setError(fetchError.message || "Verification failed.");
    } finally {
      setVerifyLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Age Credential Issuer</div>
          <h1>Issuer Demo</h1>
        </div>
        <span className="demo-badge">Demo</span>
      </header>

      <div className="meta-bar">
        <div>
          <span className="meta-label">Issuer</span>
          <strong>Demo authority (not a government agency)</strong>
        </div>
        <div className="connection-pill">
          <span className={`dot ${health.status === "ok" ? "online" : "offline"}`} />
          {health.status === "ok" ? "API Online" : "Checking API"}
        </div>
      </div>

      <main className="dashboard-grid">
        <SectionCard title="Keypair">
          <div className="key-actions">
            <ActionButton onClick={handleGenerateKeypair} disabled={keyLoading}>
              {keyLoading ? "Generating..." : "Generate Keypair"}
            </ActionButton>
            {publicKeyHex ? (
              <ActionButton variant="secondary" onClick={() => handleCopyText(publicKeyHex, "Public key")}>
                Copy Public Key
              </ActionButton>
            ) : null}
          </div>

          <div className="status-row">
            <span className={`status-indicator ${keyReady ? "ready" : "pending"}`} />
            <span>{keyReady ? "Keypair ready" : "Awaiting key generation"}</span>
          </div>

          {publicKeyHex ? (
            <div className="code-block">{publicKeyHex}</div>
          ) : (
            <EmptyState text="No public key available yet." />
          )}
        </SectionCard>

        <SectionCard title="Issue Credential">
          <form className="credential-form" onSubmit={handleIssueCredential}>
            <div className="field-group">
              <label htmlFor="dateOfBirth">Date of birth</label>
              <input
                id="dateOfBirth"
                type="date"
                value={formData.dateOfBirth}
                onChange={(event) => {
                  setFormData((current) => ({ ...current, dateOfBirth: event.target.value }));
                  setFormErrors((current) => ({ ...current, dateOfBirth: "" }));
                }}
                className={formErrors.dateOfBirth ? "input-error" : ""}
              />
              {formErrors.dateOfBirth ? <span className="field-error">{formErrors.dateOfBirth}</span> : null}
            </div>

            <ActionButton type="submit" disabled={issueLoading || !keyReady}>
              {issueLoading ? "Issuing Credential..." : "Issue Credential"}
            </ActionButton>
          </form>
        </SectionCard>

        <SectionCard title="Verification">
          <div className="verify-actions">
            <ActionButton onClick={handleVerifyCredential} disabled={verifyLoading || !credential || !signature || !publicKeyHex}>
              {verifyLoading ? "Verifying..." : "Verify Credential"}
            </ActionButton>
          </div>

          {verification ? (
            <div className={`verification-box ${verification.valid ? "success" : "danger"}`}>
              <strong>{verification.valid ? "Valid signature" : "Invalid signature"}</strong>
              <p>{verification.message}</p>
            </div>
          ) : (
            <EmptyState text="No verification performed yet." />
          )}
        </SectionCard>

        <SectionCard title="Credential" className="issued-card full-width">
          {credentialPayload ? (
            <>
              <div className="credential-actions">
                <ActionButton variant="secondary" onClick={() => handleCopyText(JSON.stringify(credentialPayload, null, 2), "Credential JSON")}>
                  Copy JSON
                </ActionButton>
                <ActionButton variant="secondary" onClick={handleDownloadJson}>
                  Download JSON
                </ActionButton>
              </div>

              <div className="credential-grid">
                <InfoRow label="Credential ID" value={credentialPayload.credential.credentialId} />
                <InfoRow label="Issuer identifier" value={credentialPayload.credential.issuer} />
                <InfoRow label="Credential type" value={credentialPayload.credential.type} />
                <InfoRow label="Issued timestamp" value={credentialPayload.credential.issuedAt} />
                <InfoRow label="Date of birth" value={credentialPayload.credential.dateOfBirth} />
                <InfoRow label="Signature" value={signature.slice(0, 18) + "..."} />
              </div>

              <div className="code-block signature-box">{signature}</div>
            </>
          ) : (
            <EmptyState text="No credential has been issued yet." />
          )}
        </SectionCard>
      </main>

      {statusMessage ? <div className="status-banner success-banner">{statusMessage}</div> : null}
      {error ? <div className="status-banner error-banner">{error}</div> : null}
    </div>
  );
}

export default App;
