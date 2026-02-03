import { useState, useEffect, useRef } from 'react'
import Tooltip from './Tooltip'

const AUTH_PROVIDERS = [
  {
    id: 'akashml',
    name: 'AkashML',
    methods: [{ id: 'akashml-api', name: 'API Key' }],
    isCustom: true,
    preset: {
      baseUrl: 'https://api.akashml.com/v1',
      model: 'deepseek-ai/DeepSeek-V3.1',
    },
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    methods: [
      { id: 'apiKey', name: 'API Key' },
      { id: 'claude-cli', name: 'Claude Code CLI Token' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    methods: [
      { id: 'openai-api-key', name: 'API Key' },
      { id: 'codex-cli', name: 'Codex CLI OAuth' },
    ],
  },
  {
    id: 'google',
    name: 'Google',
    methods: [{ id: 'gemini-api-key', name: 'Gemini API Key' }],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    methods: [{ id: 'openrouter-api-key', name: 'API Key' }],
  },
  {
    id: 'moonshot',
    name: 'Moonshot AI',
    methods: [{ id: 'moonshot-api-key', name: 'API Key' }],
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-Compatible)',
    methods: [{ id: 'custom-openai', name: 'Custom Endpoint' }],
    isCustom: true,
  },
]

export default function ProviderCard({ authChoice, authSecret, customBaseUrl, customModel, onChange, embedded }) {
  const selectedProvider = AUTH_PROVIDERS.find(p =>
    p.methods.some(m => m.id === authChoice)
  ) || AUTH_PROVIDERS[0]

  const [discoveredModels, setDiscoveredModels] = useState([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState('')
  const [useManualInput, setUseManualInput] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (selectedProvider.id !== 'akashml' || !customBaseUrl?.trim()) {
      setDiscoveredModels([])
      setModelsError('')
      return
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(async () => {
      setModelsLoading(true)
      setModelsError('')

      try {
        const res = await fetch('/get-started/api/discover-models', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            baseUrl: customBaseUrl.trim(),
            apiKey: authSecret?.trim() || '',
          }),
        })
        const data = await res.json()

        if (data.ok && data.models?.length > 0) {
          setDiscoveredModels(data.models)
          if (!customModel && data.models.length > 0) {
            const preferred = data.models.find(m => m.id.includes('DeepSeek-V3.1'))
            onChange('customModel', preferred?.id || data.models[0].id)
          }
        } else {
          setDiscoveredModels([])
          if (data.error) {
            setModelsError(data.error)
          }
        }
      } catch (err) {
        setDiscoveredModels([])
        setModelsError(err.message)
      } finally {
        setModelsLoading(false)
      }
    }, 500)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [selectedProvider.id, customBaseUrl, authSecret])

  const handleProviderChange = (e) => {
    const provider = AUTH_PROVIDERS.find(p => p.id === e.target.value)
    if (provider?.methods[0]) {
      onChange('authChoice', provider.methods[0].id)
      setDiscoveredModels([])
      setModelsError('')
      setUseManualInput(false)

      if (provider.preset) {
        onChange('customBaseUrl', provider.preset.baseUrl || '')
        onChange('customModel', provider.preset.model || '')
      } else if (!provider.isCustom) {
        onChange('customBaseUrl', '')
        onChange('customModel', '')
      }
    }
  }

  const isCustom = selectedProvider.isCustom
  const isAkashML = selectedProvider.id === 'akashml'
  const showModelDropdown = isAkashML && discoveredModels.length > 0 && !useManualInput

  const content = (
    <>
      <label style={embedded ? { marginTop: 0 } : undefined}>
        Provider
        <Tooltip text="Select your AI model provider. AkashML is recommended for decentralized inference." />
      </label>
      <select value={selectedProvider.id} onChange={handleProviderChange}>
        {AUTH_PROVIDERS.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      {!isCustom && (
        <>
          <label>
            Authentication Method
            <Tooltip text="Choose how to authenticate with this provider." />
          </label>
          <select
            value={authChoice}
            onChange={(e) => onChange('authChoice', e.target.value)}
          >
            {selectedProvider.methods.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          <label>
            API Key / Token
            <Tooltip text="Your secret API key from the provider's dashboard. Never share this publicly." />
          </label>
          <input
            type="password"
            value={authSecret}
            onChange={(e) => onChange('authSecret', e.target.value)}
            placeholder="sk-... or your token"
          />
        </>
      )}

      {isCustom && (
        <>
          <label>
            Base URL
            <Tooltip text="OpenAI-compatible API endpoint. Include /v1 if required. Works with Ollama, LM Studio, vLLM, and similar." />
          </label>
          <input
            type="text"
            value={customBaseUrl || ''}
            onChange={(e) => onChange('customBaseUrl', e.target.value)}
            placeholder="https://api.example.com/v1"
          />

          <label>
            Model Name
            <Tooltip text="The model identifier as expected by the API. Check your provider's docs for available models." />
            {isAkashML && discoveredModels.length > 0 && (
              <button
                type="button"
                onClick={() => setUseManualInput(!useManualInput)}
                style={{
                  marginLeft: '8px',
                  padding: '2px 8px',
                  fontSize: '12px',
                  background: 'transparent',
                  border: '1px solid var(--akash-accent, #ff4d4d)',
                  borderRadius: '4px',
                  color: 'var(--akash-accent, #ff4d4d)',
                  cursor: 'pointer',
                }}
              >
                {useManualInput ? 'Use Dropdown' : 'Manual Entry'}
              </button>
            )}
          </label>
          {modelsLoading && (
            <div style={{ fontSize: '13px', color: '#888', marginBottom: '4px' }}>
              Discovering available models...
            </div>
          )}
          {modelsError && !modelsLoading && (
            <div style={{ fontSize: '13px', color: '#e74c3c', marginBottom: '4px' }}>
              Discovery failed: {modelsError}
            </div>
          )}
          {showModelDropdown ? (
            <select
              value={customModel || ''}
              onChange={(e) => onChange('customModel', e.target.value)}
            >
              <option value="">Select a model...</option>
              {discoveredModels.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.reasoning ? ' (reasoning)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={customModel || ''}
              onChange={(e) => onChange('customModel', e.target.value)}
              placeholder="org/model-name or model-id"
            />
          )}
          {isAkashML && discoveredModels.length > 0 && !useManualInput && (
            <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {discoveredModels.length} model{discoveredModels.length !== 1 ? 's' : ''} available
            </div>
          )}

          <label>
            API Key
            <Tooltip text="Your secret API key. Some local servers (like Ollama) may not require this." />
          </label>
          <input
            type="password"
            value={authSecret}
            onChange={(e) => onChange('authSecret', e.target.value)}
            placeholder={selectedProvider.id === 'akashml' ? 'akml-...' : 'sk-...'}
          />
        </>
      )}
    </>
  )

  if (embedded) {
    return content
  }

  return (
    <div className="card">
      <h2>AI Provider</h2>
      {content}
    </div>
  )
}
