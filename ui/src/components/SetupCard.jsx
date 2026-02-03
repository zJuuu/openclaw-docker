import { useState } from 'react'

export default function SetupCard({ config, log, appendLog, clearLog, onRefresh, embedded }) {
  const [loading, setLoading] = useState(false)

  const runSetup = async () => {
    setLoading(true)
    clearLog()
    appendLog('Initializing OpenClaw (this may take a minute)...\n\n')

    try {
      const res = await fetch('/get-started/api/run', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          authChoice: config.authChoice,
          authSecret: config.authSecret,
          customBaseUrl: config.customBaseUrl,
          customModel: config.customModel,
          telegramToken: config.telegramToken,
          discordToken: config.discordToken,
          slackBotToken: config.slackBotToken,
          slackAppToken: config.slackAppToken,
        }),
      })

      let data
      const text = await res.text()
      try {
        data = JSON.parse(text)
      } catch {
        data = { ok: res.ok, output: text }
      }

      if (data.output) {
        appendLog(data.output + '\n')
      }

      if (res.ok && data.ok !== false) {
        appendLog('\n✓ Setup completed successfully!\n')
        appendLog('Refreshing status...\n')
      } else {
        appendLog('\n✗ Setup encountered an issue. Check the output above.\n')
      }

      // Give gateway time to fully start before refreshing
      await new Promise(r => setTimeout(r, 2000))
      onRefresh()
    } catch (err) {
      appendLog(`\nError: ${err.message}\n`)
      appendLog('The setup may still be running. Try refreshing the page in a few seconds.\n')
    } finally {
      setLoading(false)
    }
  }

  const content = (
    <>
      <button className="btn-primary" onClick={runSetup} disabled={loading} style={{ width: '100%' }}>
        {loading ? 'Initializing...' : 'Initialize OpenClaw'}
      </button>
      {log && <pre>{log}</pre>}
    </>
  )

  if (embedded) {
    return content
  }

  return (
    <div className="card">
      <h2>Run Setup</h2>
      {content}
    </div>
  )
}
