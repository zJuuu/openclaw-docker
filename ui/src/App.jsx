import { useState, useEffect } from 'react'
import LoginForm from './components/LoginForm'
import StatusCard from './components/StatusCard'
import ProviderCard from './components/ProviderCard'
import ChannelsCard from './components/ChannelsCard'
import SetupCard from './components/SetupCard'
import ConsoleCard from './components/ConsoleCard'
import BackupCard from './components/BackupCard'
import SkillsCard from './components/SkillsCard'

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
      if (!res.ok) throw new Error(await res.text())
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
    if (config.authChoice === 'akashml-api') {
      return config.authSecret.trim() !== ''
    }
    return true
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
    <div className="container">
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

      {/* Show status only when configured */}
      {isConfigured && <StatusCard status={status} />}

      {/* Single-page configuration with collapsible sections */}
      {!isConfigured && !status.loading && (
        <>
          {/* Provider Section */}
          <details className="config-section" open>
            <summary className="section-header">
              <span className="section-title">
                {isProviderValid() && <span className="section-check">✓</span>}
                AI Provider
              </span>
              <span className="section-hint">Configure your AI model provider</span>
            </summary>
            <div className="section-content">
              <ProviderCard
                authChoice={config.authChoice}
                authSecret={config.authSecret}
                customBaseUrl={config.customBaseUrl}
                customModel={config.customModel}
                onChange={updateConfig}
                embedded
              />
            </div>
          </details>

          {/* Channels Section */}
          <details className="config-section" open>
            <summary className="section-header">
              <span className="section-title">
                {isChannelsValid() && <span className="section-check">✓</span>}
                Channels
              </span>
              <span className="section-hint">Set up messaging integrations</span>
            </summary>
            <div className="section-content">
              <ChannelsCard config={config} onChange={updateConfig} embedded />
            </div>
          </details>

          {/* Initialize Section */}
          <details className="config-section" open>
            <summary className="section-header">
              <span className="section-title">Initialize</span>
              <span className="section-hint">Start your OpenClaw instance</span>
            </summary>
            <div className="section-content">
              <SetupCard
                config={config}
                log={log}
                appendLog={appendLog}
                clearLog={clearLog}
                onRefresh={refreshStatus}
                embedded
                canInitialize={canInitialize()}
              />
            </div>
          </details>

          {/* Advanced Tools - Always visible as collapsible */}
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

      {/* Show management tools when configured */}
      {isConfigured && (
        <>
          {/* Quick Actions with inline pairing form */}
          <div className="card">
            <h2>Quick Actions</h2>

            {/* Approve Pairing - Inline Form */}
            {!showPairingForm ? (
              <div className="button-group">
                <button
                  className="btn-primary"
                  onClick={() => setShowPairingForm(true)}
                >
                  Approve Pairing
                </button>
              </div>
            ) : (
              <div className="inline-form">
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
                  <label className="inline-label">Pairing Code</label>
                  <input
                    type="text"
                    value={pairingCode}
                    onChange={(e) => setPairingCode(e.target.value)}
                    placeholder="Enter pairing code"
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

          {/* Advanced Tools - Always visible as collapsible */}
          <details className="config-section advanced-section">
            <summary className="section-header">
              <span className="section-title">Advanced Tools</span>
              <span className="section-hint">Skills, Console, Backup</span>
            </summary>
            <div className="section-content">
              <SkillsCard />
              <ConsoleCard />
              <BackupCard onRefresh={refreshStatus} />

              {/* Reset Configuration with inline confirmation */}
              <div className="card">
                <h2>Reset Configuration</h2>
                <p className="hint">
                  Delete the config file to reconfigure OpenClaw. Your credentials and
                  workspace data will be preserved.
                </p>
                {!showResetConfirm ? (
                  <button
                    className="btn-danger"
                    onClick={() => setShowResetConfirm(true)}
                  >
                    Reset Config
                  </button>
                ) : (
                  <div className="inline-confirm">
                    <span className="confirm-text">Are you sure? You will need to run setup again.</span>
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
                        Confirm Reset
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  )
}
