import { useState, useEffect } from 'react'
import LoginForm from './components/LoginForm'
import StatusCard from './components/StatusCard'
import ProviderCard from './components/ProviderCard'
import ChannelsCard from './components/ChannelsCard'
import SetupCard from './components/SetupCard'
import ConsoleCard from './components/ConsoleCard'
import BackupCard from './components/BackupCard'
import SkillsCard from './components/SkillsCard'

const STEPS = [
  { id: 'provider', title: 'AI Provider', description: 'Configure your AI model provider' },
  { id: 'channels', title: 'Channels', description: 'Set up messaging integrations' },
  { id: 'initialize', title: 'Initialize', description: 'Start your OpenClaw instance' },
]

export default function App() {
  const [auth, setAuth] = useState({ loading: true, authenticated: false })
  const [status, setStatus] = useState({ loading: true })
  const [step, setStep] = useState(0)
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
  const [showAdvanced, setShowAdvanced] = useState(false)

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

  const canProceed = () => {
    if (step === 0) {
      // Provider step - need API key for AkashML
      if (config.authChoice === 'akashml-api') {
        return config.authSecret.trim() !== ''
      }
      return true
    }
    if (step === 1) {
      // Channels step - at least one channel configured
      return config.telegramToken || config.discordToken || (config.slackBotToken && config.slackAppToken)
    }
    return true
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

      {/* Multi-step onboarding */}
      {!isConfigured && !status.loading && (
        <>
          {/* Progress indicator */}
          <div className="stepper">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`step ${i === step ? 'active' : ''} ${i < step ? 'completed' : ''}`}
                onClick={() => i < step && setStep(i)}
              >
                <div className="step-number">{i < step ? '✓' : i + 1}</div>
                <div className="step-label">{s.title}</div>
              </div>
            ))}
          </div>

          {/* Step content */}
          <div className="step-content">
            <div className="step-header">
              <h2>{STEPS[step].title}</h2>
              <p className="hint">{STEPS[step].description}</p>
            </div>

            {step === 0 && (
              <ProviderCard
                authChoice={config.authChoice}
                authSecret={config.authSecret}
                customBaseUrl={config.customBaseUrl}
                customModel={config.customModel}
                onChange={updateConfig}
                embedded
              />
            )}

            {step === 1 && (
              <ChannelsCard config={config} onChange={updateConfig} embedded />
            )}

            {step === 2 && (
              <SetupCard
                config={config}
                log={log}
                appendLog={appendLog}
                clearLog={clearLog}
                onRefresh={refreshStatus}
                embedded
              />
            )}
          </div>

          {/* Navigation */}
          <div className="step-nav">
            <button
              className="btn-secondary"
              onClick={() => setStep(s => s - 1)}
              disabled={step === 0}
            >
              Back
            </button>
            <div className="step-nav-spacer" />
            {step < STEPS.length - 1 ? (
              <button
                className="btn-primary"
                onClick={() => setStep(s => s + 1)}
                disabled={!canProceed()}
              >
                Continue
              </button>
            ) : null}
          </div>

          {/* Recovery tools */}
          <div className="recovery-section">
            <button
              className="btn-secondary btn-small"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? 'Hide' : 'Show'} Recovery Tools
            </button>
            {showAdvanced && (
              <>
                <SkillsCard />
                <ConsoleCard />
                <BackupCard onRefresh={refreshStatus} />
              </>
            )}
          </div>
        </>
      )}

      {/* Show management tools when configured */}
      {isConfigured && (
        <>
          <div className="card">
            <h2>Quick Actions</h2>
            <div className="button-group">
              <button
                className="btn-primary"
                onClick={async () => {
                  const channel = prompt('Channel (telegram/discord):')
                  if (!channel) return
                  const code = prompt('Pairing code:')
                  if (!code) return
                  try {
                    const res = await fetch('/get-started/api/pairing/approve', {
                      method: 'POST',
                      credentials: 'same-origin',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ channel, code }),
                    })
                    const data = await res.json()
                    if (data.ok) {
                      alert('Pairing approved!')
                    } else {
                      alert('Error: ' + (data.error || data.output))
                    }
                  } catch (err) {
                    alert('Error: ' + err.message)
                  }
                }}
              >
                Approve Pairing
              </button>
              <button
                className="btn-secondary"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? 'Hide' : 'Show'} Advanced Tools
              </button>
            </div>
          </div>

          {showAdvanced && (
            <>
              <SkillsCard />
              <ConsoleCard />
              <BackupCard onRefresh={refreshStatus} />

              <div className="card">
                <h2>Reset Configuration</h2>
                <p className="hint">
                  Delete the config file to reconfigure OpenClaw. Your credentials and
                  workspace data will be preserved.
                </p>
                <button
                  className="btn-danger"
                  onClick={async () => {
                    if (!confirm('Reset configuration? You will need to run setup again.')) return
                    try {
                      await fetch('/get-started/api/reset', { method: 'POST', credentials: 'same-origin' })
                      refreshStatus()
                    } catch (err) {
                      alert('Error: ' + err.message)
                    }
                  }}
                >
                  Reset Config
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
