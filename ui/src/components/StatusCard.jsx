import { useState } from 'react'

export default function StatusCard({ status }) {
  const [showToken, setShowToken] = useState(false)
  const [copied, setCopied] = useState(false)

  const isConfigured = status.configured && !status.loading && !status.error

  const copyToken = async () => {
    if (status.gatewayToken) {
      await navigator.clipboard.writeText(status.gatewayToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (status.loading) {
    return (
      <div className="card">
        <h2>Status</h2>
        <div className="status pending">Loading...</div>
      </div>
    )
  }

  if (status.error) {
    return (
      <div className="card">
        <h2>Status</h2>
        <div className="status error">Error: {status.error}</div>
      </div>
    )
  }

  if (isConfigured) {
    return (
      <div className="card configured">
        <h2>OpenClaw is Running</h2>
        <div className="status ok" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {status.openclawVersion && <span>{status.openclawVersion}</span>}
          {status.gatewayState && (
            <span style={{
              fontSize: '0.8rem',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              background: status.gatewayState === 'running' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(251, 191, 36, 0.3)',
            }}>
              Gateway: {status.gatewayState}
            </span>
          )}
        </div>
        {status.gatewayToken && (
          <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <strong style={{ color: '#fbbf24' }}>Gateway Token</strong>
              <div>
                <button
                  onClick={() => setShowToken(!showToken)}
                  className="btn-secondary"
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', marginRight: '0.5rem' }}
                >
                  {showToken ? 'Hide' : 'Show'}
                </button>
                <button
                  onClick={copyToken}
                  className="btn-secondary"
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <p className="hint" style={{ margin: '0.5rem 0' }}>
              Use this token for CLI access or external API integrations.
            </p>
            {showToken && (
              <code style={{
                display: 'block',
                padding: '0.5rem',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '4px',
                wordBreak: 'break-all',
                fontSize: '0.75rem'
              }}>
                {status.gatewayToken}
              </code>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="card">
      <h2>Status</h2>
      <div className="status pending">Not configured - complete setup below</div>
    </div>
  )
}
