import { useState } from 'react'

export default function SkillsCard() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)

  const listSkills = async () => {
    setLoading(true)
    setOutput('Loading installed skills...\n')
    try {
      const res = await fetch('/get-started/api/skills', {
        credentials: 'same-origin',
      })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = await res.json()
      setOutput(data.output || 'No skills installed')
    } catch (err) {
      setOutput(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const searchSkills = async (query) => {
    setLoading(true)
    setOutput('Searching...\n')
    try {
      const res = await fetch('/get-started/api/skills/search', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = await res.json()
      setOutput(data.output || 'No results found')
    } catch (err) {
      setOutput(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const installSkill = async (slug) => {
    setLoading(true)
    setOutput(`Installing ${slug}...\n`)
    try {
      const res = await fetch('/get-started/api/skills/install', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = await res.json()
      setOutput(data.output || (data.ok ? 'Installed successfully' : 'Installation failed'))
      if (data.ok) setInput('')
    } catch (err) {
      setOutput(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const updateSkills = async () => {
    setLoading(true)
    setOutput('Updating all skills...\n')
    try {
      const res = await fetch('/get-started/api/skills/update', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = await res.json()
      setOutput(data.output || (data.ok ? 'All skills updated' : 'Update failed'))
    } catch (err) {
      setOutput(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Smart action: if input contains '/', treat as install; otherwise search
  const handleSmartAction = () => {
    if (!input.trim()) return
    if (input.includes('/')) {
      installSkill(input.trim())
    } else {
      searchSkills(input.trim())
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSmartAction()
    }
  }

  return (
    <div className="card">
      <h2>Skills Manager</h2>
      <p className="hint">Search and install skills from ClawHub</p>

      {/* Unified input row */}
      <div className="skills-unified">
        <div className="input-row">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search or install (e.g. 'git' or 'owner/skill')"
            disabled={loading}
          />
          <button
            className="btn-primary"
            onClick={handleSmartAction}
            disabled={loading || !input.trim()}
          >
            {loading ? 'Working...' : input.includes('/') ? 'Install' : 'Search'}
          </button>
        </div>

        {/* Quick action buttons */}
        <div className="button-row">
          <button className="btn-secondary" onClick={listSkills} disabled={loading}>
            View Installed
          </button>
          <button className="btn-secondary" onClick={updateSkills} disabled={loading}>
            Update All
          </button>
        </div>
      </div>

      {output && <pre className="skills-output">{output}</pre>}
    </div>
  )
}
