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
      { id: 'diag:logs', label: 'View Logs', needsArg: 'lines' },
    ],
  },
  {
    label: 'System',
    commands: [
      { id: 'sys:brew', label: 'Homebrew Version' },
      { id: 'sys:node', label: 'Node Version' },
      { id: 'sys:disk-usage', label: 'Disk Usage' },
    ],
  },
]

export default function ConsoleCard() {
  const [cmd, setCmd] = useState('diag:status')
  const [arg, setArg] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)

  // Find current command to check if it needs an arg
  const currentCmd = COMMAND_GROUPS
    .flatMap(g => g.commands)
    .find(c => c.id === cmd)

  const runCommand = async () => {
    setLoading(true)
    setOutput('Running...\n')

    try {
      const res = await fetch('/get-started/api/console', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cmd, arg: arg || undefined }),
      })
      const data = await res.json()
      setOutput(data.output || JSON.stringify(data, null, 2))
    } catch (err) {
      setOutput(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <h2>Debug Console</h2>
      <div className="console-row">
        <select value={cmd} onChange={(e) => setCmd(e.target.value)}>
          {COMMAND_GROUPS.map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.commands.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {currentCmd?.needsArg && (
          <input
            value={arg}
            onChange={(e) => setArg(e.target.value)}
            placeholder={`Enter ${currentCmd.needsArg} (optional)`}
          />
        )}
        <button className="btn-secondary" onClick={runCommand} disabled={loading}>
          {loading ? 'Running...' : 'Run'}
        </button>
      </div>
      {output && <pre>{output}</pre>}
    </div>
  )
}
