import { useState } from 'react'

export default function SetupCard({ config, log, appendLog, clearLog, onRefresh, embedded, canInitialize = true }) {
  const [loading, setLoading] = useState(false)

  const runSetup = async () => {
    setLoading(true)
    clearLog()
    appendLog('Initializing OpenClaw...\n\n')

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

      // Stream SSE events from the response
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let ok = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Parse complete SSE messages from the buffer
        const parts = buffer.split('\n\n')
        buffer = parts.pop() // keep incomplete chunk

        for (const part of parts) {
          let event = 'message'
          let data = ''
          for (const line of part.split('\n')) {
            if (line.startsWith('event: ')) event = line.slice(7)
            else if (line.startsWith('data: ')) data = line.slice(6)
          }
          if (!data) continue

          try {
            const parsed = JSON.parse(data)
            if (event === 'progress' && parsed.message) {
              appendLog(parsed.message + '\n')
            } else if (event === 'done') {
              ok = parsed.ok
            }
          } catch {}
        }
      }

      if (ok) {
        appendLog('\n✓ Setup completed successfully!\n')
        appendLog('Refreshing status...\n')
      } else {
        appendLog('\n✗ Setup encountered an issue. Check the output above.\n')
      }

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
      {!canInitialize && (
        <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
          Complete the AI Provider and Channels sections above to enable initialization.
        </p>
      )}
      <button className="btn-primary" onClick={runSetup} disabled={loading || !canInitialize} style={{ width: '100%' }}>
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
