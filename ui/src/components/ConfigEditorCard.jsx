import { useState, useEffect, useRef } from 'react'

export default function ConfigEditorCard() {
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [restartGateway, setRestartGateway] = useState(true)
  const textareaRef = useRef(null)

  const isDirty = content !== savedContent

  const fetchConfig = async () => {
    setLoading(true)
    setStatus('')
    setJsonError('')
    try {
      const res = await fetch('/get-started/api/config', { credentials: 'same-origin' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      const pretty = JSON.stringify(data.config, null, 2)
      setContent(pretty)
      setSavedContent(pretty)
    } catch (err) {
      setStatus('Error loading: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchConfig() }, [])

  const validate = (text) => {
    try {
      JSON.parse(text)
      setJsonError('')
      return true
    } catch (err) {
      setJsonError(err.message)
      return false
    }
  }

  const handleChange = (e) => {
    const val = e.target.value
    setContent(val)
    if (val.trim()) validate(val)
    else setJsonError('')
  }

  const handleSave = async () => {
    if (!validate(content)) return
    setSaving(true)
    setStatus('')
    try {
      const parsed = JSON.parse(content)
      const res = await fetch('/get-started/api/config', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config: parsed, restartGateway }),
      })
      if (!res.ok) throw new Error(`Save failed (${res.status})`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Save failed')
      const pretty = JSON.stringify(parsed, null, 2)
      setContent(pretty)
      setSavedContent(pretty)
      setStatus(data.gatewayRestarted ? 'Saved & gateway restarted' : 'Saved')
      setTimeout(() => setStatus(''), 3000)
    } catch (err) {
      setStatus('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleReload = () => {
    fetchConfig()
  }

  return (
    <div className="card">
      <h2>Config Editor</h2>
      <p className="hint" style={{ marginTop: 0, marginBottom: '12px' }}>
        View and edit the raw openclaw.json configuration.
      </p>

      {loading ? (
        <div className="status pending">Loading config...</div>
      ) : (
        <>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            spellCheck={false}
            style={{
              width: '100%',
              minHeight: '200px',
              fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Consolas', monospace",
              fontSize: '0.8125rem',
              lineHeight: '1.6',
              resize: 'vertical',
              marginTop: 0,
              tabSize: 2,
            }}
          />

          {jsonError && (
            <div className="inline-status error" style={{ marginTop: '8px' }}>
              JSON: {jsonError}
            </div>
          )}

          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '12px',
            cursor: 'pointer',
            textTransform: 'none',
            letterSpacing: 'normal',
            fontSize: '0.8125rem',
            color: '#A3A3A3',
          }}>
            <input
              type="checkbox"
              checked={restartGateway}
              onChange={(e) => setRestartGateway(e.target.checked)}
              style={{ width: 'auto', margin: 0, padding: 0 }}
            />
            Restart gateway after save
          </label>

          <div className="inline-form-actions" style={{ marginTop: '12px' }}>
            <button
              className="btn-secondary"
              onClick={handleReload}
              disabled={saving}
            >
              Reload
            </button>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={!isDirty || !!jsonError || saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>

          {status && (
            <div className={`inline-status ${status.startsWith('Error') ? 'error' : ''}`} style={{ marginTop: '8px' }}>
              {status}
            </div>
          )}
        </>
      )}
    </div>
  )
}
