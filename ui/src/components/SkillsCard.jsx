import { useState } from 'react'

export default function SkillsCard() {
  const [query, setQuery] = useState('')
  const [slug, setSlug] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('installed')

  const listSkills = async () => {
    setLoading(true)
    setOutput('Loading installed skills...\n')
    try {
      const res = await fetch('/get-started/api/skills', {
        credentials: 'same-origin',
      })
      const data = await res.json()
      setOutput(data.output || 'No skills installed')
    } catch (err) {
      setOutput(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const searchSkills = async () => {
    setLoading(true)
    setOutput('Searching...\n')
    try {
      const res = await fetch('/get-started/api/skills/search', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const data = await res.json()
      setOutput(data.output || 'No results found')
    } catch (err) {
      setOutput(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const installSkill = async () => {
    if (!slug.trim()) return
    setLoading(true)
    setOutput(`Installing ${slug}...\n`)
    try {
      const res = await fetch('/get-started/api/skills/install', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      const data = await res.json()
      setOutput(data.output || (data.ok ? 'Installed successfully' : 'Installation failed'))
      if (data.ok) setSlug('')
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
      const data = await res.json()
      setOutput(data.output || (data.ok ? 'All skills updated' : 'Update failed'))
    } catch (err) {
      setOutput(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <h2>Skills Manager</h2>
      <p className="hint">Install and manage OpenClaw skills via ClawHub</p>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'installed' ? 'active' : ''}`}
          onClick={() => setActiveTab('installed')}
        >
          Installed
        </button>
        <button
          className={`tab ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          Search
        </button>
        <button
          className={`tab ${activeTab === 'install' ? 'active' : ''}`}
          onClick={() => setActiveTab('install')}
        >
          Install
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'installed' && (
          <div className="skills-section">
            <div className="button-row">
              <button className="btn-secondary" onClick={listSkills} disabled={loading}>
                {loading ? 'Loading...' : 'Refresh List'}
              </button>
              <button className="btn-secondary" onClick={updateSkills} disabled={loading}>
                Update All
              </button>
            </div>
          </div>
        )}

        {activeTab === 'search' && (
          <div className="skills-section">
            <div className="input-row">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search skills..."
                onKeyDown={(e) => e.key === 'Enter' && searchSkills()}
              />
              <button className="btn-primary" onClick={searchSkills} disabled={loading}>
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'install' && (
          <div className="skills-section">
            <div className="input-row">
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="Skill slug (e.g. sonoscli)"
                onKeyDown={(e) => e.key === 'Enter' && installSkill()}
              />
              <button className="btn-primary" onClick={installSkill} disabled={loading || !slug.trim()}>
                {loading ? 'Installing...' : 'Install'}
              </button>
            </div>
          </div>
        )}
      </div>

      {output && <pre className="skills-output">{output}</pre>}
    </div>
  )
}
