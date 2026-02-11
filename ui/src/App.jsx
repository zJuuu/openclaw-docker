import { useState, useEffect } from 'react'
import LoginForm from './components/LoginForm'
import StatusCard from './components/StatusCard'
import ProviderCard from './components/ProviderCard'
import ChannelsCard from './components/ChannelsCard'
import SetupCard from './components/SetupCard'
import ConsoleCard from './components/ConsoleCard'
import BackupCard from './components/BackupCard'
import SkillsCard from './components/SkillsCard'
import ConfigEditorCard from './components/ConfigEditorCard'

export default function App() {
  const [auth, setAuth] = useState({ loading: true, authenticated: false })
  const [status, setStatus] = useState({ loading: true })
  const [config, setConfig] = useState({
    authChoice: 'akashml-api',
    authSecret: '',
    customBaseUrl: 'https://api.akashml.com/v1',
    customModel: 'deepseek-ai/DeepSeek-V3.1',
    telegramToken: '',
    discordToken: '',
    slackBotToken: '',
    slackAppToken: '',
  })
  const [log, setLog] = useState('')

  // Onboarding step state
  const [setupStep, setSetupStep] = useState(0) // 0=Provider, 1=Channels, 2=Initialize

  // Inline UI states
  const [showPairingForm, setShowPairingForm] = useState(false)
  const [pairingChannel, setPairingChannel] = useState('telegram')
  const [pairingCode, setPairingCode] = useState('')
  const [pairingStatus, setPairingStatus] = useState('')
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // Check auth status on load
  useEffect(() => {
    // Skip auth in dev mode
    if (import.meta.env.DEV) {
      setAuth({ loading: false, authenticated: true })
      setStatus({ loading: false, configured: false, gatewayState: 'stopped', openclawVersion: 'dev' })
      return
    }
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const res = await fetch('/get-started/api/auth', { credentials: 'same-origin' })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = await res.json()
      setAuth({ loading: false, ...data })

      if (data.authenticated) {
        refreshStatus()
      }
    } catch (err) {
      setAuth({ loading: false, authenticated: false, error: err.message })
    }
  }

  const refreshStatus = async () => {
    try {
      const res = await fetch('/get-started/api/status', { credentials: 'same-origin' })
      if (res.status === 401) {
        setAuth({ loading: false, authenticated: false })
        return
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = await res.json()
      setStatus({ ...data, loading: false })
    } catch (err) {
      setStatus({ error: err.message, loading: false })
    }
  }

  const handleLogin = () => {
    setAuth({ loading: false, authenticated: true })
    refreshStatus()
  }

  const handleLogout = async () => {
    try {
      await fetch('/get-started/api/logout', { method: 'POST', credentials: 'same-origin' })
    } catch {}
    setAuth({ loading: false, authenticated: false })
    setStatus({ loading: true })
  }

  const updateConfig = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  const appendLog = (text) => {
    setLog(prev => prev + text)
  }

  const clearLog = () => setLog('')

  // Validation checks for each section
  const isProviderValid = () => {
    const choice = config.authChoice
    // CLI-based auth methods don't need a key
    if (choice === 'claude-cli' || choice === 'codex-cli') return true
    // Custom endpoint needs at least a base URL and model
    if (choice === 'custom-openai') {
      return config.customBaseUrl.trim() !== '' && config.customModel.trim() !== ''
    }
    // AkashML needs model and API key (base URL is preset)
    if (choice === 'akashml-api') {
      return config.customModel.trim() !== '' && config.authSecret.trim() !== ''
    }
    // All other API key providers need a key
    return config.authSecret.trim() !== ''
  }

  const isChannelsValid = () => {
    return config.telegramToken || config.discordToken || (config.slackBotToken && config.slackAppToken)
  }

  const canInitialize = () => isProviderValid() && isChannelsValid()

  // Pairing approval handler
  const handleApprovePairing = async () => {
    if (!pairingCode.trim()) return
    setPairingStatus('Approving...')
    try {
      const res = await fetch('/get-started/api/pairing/approve', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel: pairingChannel, code: pairingCode }),
      })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = await res.json()
      if (data.ok) {
        setPairingStatus('Pairing approved!')
        setPairingCode('')
        setTimeout(() => {
          setShowPairingForm(false)
          setPairingStatus('')
        }, 2000)
      } else {
        setPairingStatus('Error: ' + (data.error || data.output))
      }
    } catch (err) {
      setPairingStatus('Error: ' + err.message)
    }
  }

  // Reset config handler
  const handleResetConfig = async () => {
    try {
      await fetch('/get-started/api/reset', { method: 'POST', credentials: 'same-origin' })
      setShowResetConfirm(false)
      refreshStatus()
    } catch (err) {
      setShowResetConfirm(false)
    }
  }

  // Show loading
  if (auth.loading) {
    return (
      <div className="container">
        <div className="card">
          <div className="status pending">Loading...</div>
        </div>
      </div>
    )
  }

  // Show login form
  if (!auth.authenticated) {
    return <LoginForm onLogin={handleLogin} />
  }

  const isConfigured = status.configured && !status.loading && !status.error

  return (
    <div className={`container${isConfigured ? ' dashboard' : ''}`}>
      <div className="header">
        <div>
          <h1>OpenClaw <span className="akash-accent">on Akash</span></h1>
          <p className="subtitle">
            {isConfigured
              ? 'Manage your decentralized deployment'
              : 'Configure your decentralized deployment'}
          </p>
        </div>
        <button onClick={handleLogout} className="btn-secondary btn-small">
          Logout
        </button>
      </div>

      {/* Step-by-step onboarding wizard */}
      {!isConfigured && !status.loading && (
        <>
          {/* Stepper */}
          <div className="stepper">
            {['Provider', 'Channels', 'Initialize'].map((label, i) => (
              <div
                key={label}
                className={`step${setupStep === i ? ' active' : ''}${(i === 0 && isProviderValid()) || (i === 1 && isChannelsValid()) ? ' completed' : ''}`}
                onClick={() => {
                  if ((i === 0) || (i === 1 && isProviderValid()) || (i === 2 && isProviderValid() && isChannelsValid())) {
                    setSetupStep(i)
                  }
                }}
              >
                <div className="step-number">
                  {(i === 0 && isProviderValid()) || (i === 1 && isChannelsValid()) ? '✓' : i + 1}
                </div>
                <div className="step-label">{label}</div>
              </div>
            ))}
          </div>

          {/* Step 1: Provider */}
          {setupStep === 0 && (
            <div className="step-content">
              <div className="step-header">
                <h2>AI Provider</h2>
                <p className="hint">Configure your AI model provider</p>
              </div>
              <ProviderCard
                authChoice={config.authChoice}
                authSecret={config.authSecret}
                customBaseUrl={config.customBaseUrl}
                customModel={config.customModel}
                onChange={updateConfig}
                embedded
              />
              <div className="step-nav" style={{ marginTop: '24px', marginBottom: 0 }}>
                <div className="step-nav-spacer" />
                <button
                  className="btn-primary"
                  onClick={() => setSetupStep(1)}
                  disabled={!isProviderValid()}
                >
                  Next: Channels
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Channels */}
          {setupStep === 1 && (
            <div className="step-content">
              <div className="step-header">
                <h2>Channels</h2>
                <p className="hint">Set up messaging integrations (at least one required)</p>
              </div>
              <ChannelsCard config={config} onChange={updateConfig} embedded />
              <div className="step-nav" style={{ marginTop: '24px', marginBottom: 0 }}>
                <button
                  className="btn-secondary"
                  onClick={() => setSetupStep(0)}
                >
                  Back
                </button>
                <div className="step-nav-spacer" />
                <button
                  className="btn-primary"
                  onClick={() => setSetupStep(2)}
                  disabled={!isChannelsValid()}
                >
                  Next: Initialize
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Initialize */}
          {setupStep === 2 && (
            <div className="step-content">
              <div className="step-header">
                <h2>Initialize</h2>
                <p className="hint">Start your OpenClaw instance</p>
              </div>
              <SetupCard
                config={config}
                log={log}
                appendLog={appendLog}
                clearLog={clearLog}
                onRefresh={refreshStatus}
                embedded
                canInitialize={canInitialize()}
              />
              <div className="step-nav" style={{ marginTop: '24px', marginBottom: 0 }}>
                <button
                  className="btn-secondary"
                  onClick={() => setSetupStep(1)}
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {/* Advanced Tools - collapsible below wizard */}
          <details className="config-section advanced-section">
            <summary className="section-header">
              <span className="section-title">Advanced Tools</span>
              <span className="section-hint">Skills, Console, Backup</span>
            </summary>
            <div className="section-content">
              <SkillsCard />
              <ConsoleCard />
              <BackupCard onRefresh={refreshStatus} />
            </div>
          </details>
        </>
      )}

      {/* Dashboard layout when configured */}
      {isConfigured && (
        <div className="dashboard-grid">
          {/* Full width status */}
          <StatusCard status={status} />

          {/* 3-column row: Quick Actions, Approve Pairing, Reset Config */}
          <div className="dashboard-row-3">
            {/* Quick Actions */}
            <div className="card">
              <h2>Quick Actions</h2>
              <div className="button-group" style={{ flexDirection: 'column' }}>
                <a href="/openclaw" className="btn-primary" style={{
                  display: 'inline-flex',
                  textDecoration: 'none',
                  textAlign: 'center',
                  justifyContent: 'center',
                }}>
                  Control Panel
                </a>
                <a href="/get-started/export" className="btn-secondary" style={{
                  display: 'inline-flex',
                  textDecoration: 'none',
                  textAlign: 'center',
                  justifyContent: 'center',
                }}>
                  Download Backup
                </a>
              </div>
            </div>

            {/* Approve Pairing */}
            <div className="card">
              <h2>Approve Pairing</h2>
              {!showPairingForm ? (
                <button
                  className="btn-primary"
                  onClick={() => setShowPairingForm(true)}
                  style={{ width: '100%' }}
                >
                  Approve Pairing
                </button>
              ) : (
                <div className="inline-form" style={{ padding: '12px' }}>
                  <div className="inline-form-row">
                    <label className="inline-label">Channel</label>
                    <div className="channel-selector">
                      <button
                        className={`channel-btn ${pairingChannel === 'telegram' ? 'active' : ''}`}
                        onClick={() => setPairingChannel('telegram')}
                      >
                        Telegram
                      </button>
                      <button
                        className={`channel-btn ${pairingChannel === 'discord' ? 'active' : ''}`}
                        onClick={() => setPairingChannel('discord')}
                      >
                        Discord
                      </button>
                    </div>
                  </div>
                  <div className="inline-form-row">
                    <label className="inline-label">Code</label>
                    <input
                      type="text"
                      value={pairingCode}
                      onChange={(e) => setPairingCode(e.target.value)}
                      placeholder="Pairing code"
                      className="inline-input"
                    />
                  </div>
                  {pairingStatus && (
                    <div className={`inline-status ${pairingStatus.startsWith('Error') ? 'error' : ''}`}>
                      {pairingStatus}
                    </div>
                  )}
                  <div className="inline-form-actions">
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        setShowPairingForm(false)
                        setPairingCode('')
                        setPairingStatus('')
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn-primary"
                      onClick={handleApprovePairing}
                      disabled={!pairingCode.trim()}
                    >
                      Approve
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Reset Config */}
            <div className="card">
              <h2>Reset Config</h2>
              <p className="hint" style={{ marginTop: 0 }}>
                Delete config to reconfigure. Data is preserved.
              </p>
              {!showResetConfirm ? (
                <button
                  className="btn-danger"
                  onClick={() => setShowResetConfirm(true)}
                  style={{ width: '100%' }}
                >
                  Reset Config
                </button>
              ) : (
                <div className="inline-confirm">
                  <span className="confirm-text">Are you sure?</span>
                  <div className="inline-form-actions">
                    <button
                      className="btn-secondary"
                      onClick={() => setShowResetConfirm(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn-danger"
                      onClick={handleResetConfig}
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 2-column row: Skills, Console */}
          <div className="dashboard-row-2">
            <SkillsCard />
            <ConsoleCard />
          </div>

          {/* 2-column row: Backup, Config Editor */}
          <div className="dashboard-row-2">
            <BackupCard onRefresh={refreshStatus} />
            <ConfigEditorCard />
          </div>
        </div>
      )}
    </div>
  )
}
