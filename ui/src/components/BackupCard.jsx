import { useState, useRef } from 'react'

export default function BackupCard({ onRefresh }) {
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const fileRef = useRef(null)

  const exportBackup = async () => {
    setLoading(true)
    setOutput('Creating backup...\n')

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

  const importBackup = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      alert('Select a backup file first')
      return
    }
    if (!confirm('Import backup? This will overwrite current data and restart the gateway.')) return

    setLoading(true)
    setOutput(`Uploading ${file.name} (${(file.size / 1024).toFixed(1)} KB)...\n`)

    try {
      const buf = await file.arrayBuffer()
      const res = await fetch('/get-started/import', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/gzip' },
        body: buf,
      })
      const data = await res.json()
      setOutput(prev => prev + (data.message || JSON.stringify(data)) + '\n')
      if (res.ok) {
        setOutput(prev => prev + 'Backup restored successfully!\n')
        onRefresh()
      }
    } catch (err) {
      setOutput(prev => prev + `Error: ${err.message}\n`)
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

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
        />
        <button
          className="btn-danger"
          onClick={importBackup}
          disabled={loading}
          style={{ marginTop: '0.5rem' }}
        >
          {loading ? 'Importing...' : 'Import & Restore'}
        </button>
      </div>

      {output && (
        <div className="backup-output">
          <pre>{output}</pre>
        </div>
      )}
    </div>
  )
}
