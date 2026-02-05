import { useState } from 'react'

const COMMAND_GROUPS = [
  {
    label: 'Gateway',
    commands: [
      { id: 'gw:start', label: 'Start' },
      { id: 'gw:stop', label: 'Stop' },
      { id: 'gw:restart', label: 'Restart' },
    ],
  },
  {
    label: 'Diagnostics',
    commands: [
      { id: 'diag:status', label: 'Status' },
      { id: 'diag:doctor', label: 'Doctor' },
      { id: 'diag:logs', label: 'Logs', needsArg: 'lines' },
    ],
  },
  {
    label: 'System',
    commands: [
      { id: 'sys:brew', label: 'Brew' },
      { id: 'sys:node', label: 'Node' },
      { id: 'sys:disk-usage', label: 'Disk' },
    ],
  },
]

export default function ConsoleCard() {
  const [cmd, setCmd] = useState('')
  const [arg, setArg] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)

  // Find current command to check if it needs an arg
  const currentCmd = COMMAND_GROUPS
    .flatMap(g => g.commands)
    .find(c => c.id === cmd)

  const runCommand = async (commandId) => {
    const cmdToRun = commandId || cmd
    if (!cmdToRun) return

    setCmd(cmdToRun)
    setLoading(true)
    setOutput('Running...\n')

    try {
      const res = await fetch('/get-started/api/console', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cmd: cmdToRun, arg: arg || undefined }),
      })
      const text = await res.text()
      let data
      try {
        data = JSON.parse(text)
      } catch {
        setOutput(text || `HTTP ${res.status}`)
        setLoading(false)
        return
      }
      setOutput(data.output || data.error || JSON.stringify(data, null, 2))
    } catch (err) {
      setOutput(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <h2>Debug Console</h2>

      {/* Command button grid */}
      <div className="command-grid">
        {COMMAND_GROUPS.map(group => (
          <div key={group.label} className="command-group">
            <div className="command-group-label">{group.label}</div>
            <div className="command-buttons">
              {group.commands.map(c => (
                <button
                  key={c.id}
                  className={`command-btn ${cmd === c.id ? 'active' : ''}`}
                  onClick={() => runCommand(c.id)}
                  disabled={loading}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Arg input for commands that need it */}
      {currentCmd?.needsArg && (
        <div className="console-arg-row">
          <input
            value={arg}
            onChange={(e) => setArg(e.target.value)}
            placeholder={`Enter ${currentCmd.needsArg} (optional)`}
          />
          <button className="btn-secondary" onClick={() => runCommand()} disabled={loading}>
            Run Again
          </button>
        </div>
      )}

      {output && <pre>{output}</pre>}
    </div>
  )
}
