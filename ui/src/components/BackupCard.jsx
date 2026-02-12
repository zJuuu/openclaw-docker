import { useState, useRef } from 'react'

export default function BackupCard({ onRefresh }) {
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showImportConfirm, setShowImportConfirm] = useState(null) // null | 'full' | 'memory'
  const fileRef = useRef(null)

  const exportBackup = async () => {
    setLoading(true)
    setOutput('Creating backup...\n')
    setError('')

    try {
      const res = await fetch('/get-started/export', { credentials: 'same-origin' })
      if (!res.ok) throw new Error(await res.text())

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `openclaw-backup-${Date.now()}.tar.gz`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setOutput(`Backup downloaded: ${a.download}\n`)
    } catch (err) {
      setOutput(`Error: ${err.message}\n`)
    } finally {
      setLoading(false)
    }
  }

  const handleImportClick = (mode) => {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setError('Select a backup file first')
      return
    }
    setError('')
    setShowImportConfirm(mode)
  }

  const importBackup = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return

    const mode = showImportConfirm
    setShowImportConfirm(null)
    setLoading(true)
    setOutput(`Uploading ${file.name} (${(file.size / 1024).toFixed(1)} KB)...\n`)
    setError('')

    const endpoint = mode === 'memory'
      ? '/get-started/import?mode=memory'
      : '/get-started/import'

    try {
      const buf = await file.arrayBuffer()
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/gzip' },
        body: buf,
      })
      if (!res.ok) {
        throw new Error(await res.text() || `Upload failed (HTTP ${res.status})`)
      }
      const data = await res.json()
      setOutput(prev => prev + (data.message || 'Backup restored successfully!') + '\n')
      onRefresh()
    } catch (err) {
      setOutput(prev => prev + `Error: ${err.message}\n`)
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const confirmMessage = showImportConfirm === 'memory'
    ? 'This will restore workspace files, sessions, and conversations. Config and credentials are kept. Continue?'
    : 'This will overwrite all data and restart the gateway. Continue?'

  return (
    <div className="card">
      <h2>Backup & Restore</h2>
      <p className="hint">
        Export or import your OpenClaw data including config, credentials, sessions, and workspace.
      </p>

      <div className="backup-section">
        <h3>Export Backup</h3>
        <p className="hint">Download a full backup of your OpenClaw data.</p>
        <button
          className="btn-primary"
          onClick={exportBackup}
          disabled={loading}
        >
          {loading ? 'Creating...' : 'Download Backup'}
        </button>
      </div>

      <div className="backup-section">
        <h3>Import Backup</h3>
        <p className="hint">Restore from a previous backup file (.tar.gz).</p>
        <input
          ref={fileRef}
          type="file"
          accept=".tar.gz,.tgz,application/gzip,application/x-gzip,application/x-tar"
          disabled={loading}
          onChange={() => {
            setError('')
            setShowImportConfirm(null)
          }}
        />

        {error && (
          <div className="inline-error">{error}</div>
        )}

        {!showImportConfirm ? (
          <div className="inline-form-actions" style={{ marginTop: '0.5rem' }}>
            <button
              className="btn-danger"
              onClick={() => handleImportClick('full')}
              disabled={loading}
            >
              {loading ? 'Importing...' : 'Full Restore'}
            </button>
            <button
              className="btn-secondary"
              onClick={() => handleImportClick('memory')}
              disabled={loading}
            >
              {loading ? 'Importing...' : 'Memory Only'}
            </button>
          </div>
        ) : (
          <div className="inline-confirm" style={{ marginTop: '0.5rem' }}>
            <span className="confirm-text">{confirmMessage}</span>
            <div className="inline-form-actions">
              <button
                className="btn-secondary"
                onClick={() => setShowImportConfirm(null)}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={importBackup}
              >
                Confirm
              </button>
            </div>
          </div>
        )}
      </div>

      {output && (
        <div className="backup-output">
          <pre>{output}</pre>
        </div>
      )}
    </div>
  )
}
