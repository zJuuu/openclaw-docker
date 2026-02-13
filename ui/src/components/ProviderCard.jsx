import { useState, useEffect, useRef } from 'react'
import Tooltip from './Tooltip'

const PRIMARY_PROVIDER = {
  id: 'akashml',
  name: 'AkashML',
  methods: [{ id: 'akashml-api', name: 'API Key' }],
  isCustom: true,
  preset: {
    baseUrl: 'https://api.akashml.com/v1',
    model: 'MiniMaxAI/MiniMax-M2.5',
  },
}

const EXPERIMENTAL_PROVIDERS = [
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
    name: 'Custom',
    methods: [{ id: 'custom-openai', name: 'Custom Endpoint' }],
    isCustom: true,
  },
]

const AUTH_PROVIDERS = [PRIMARY_PROVIDER, ...EXPERIMENTAL_PROVIDERS]

export default function ProviderCard({ authChoice, authSecret, customBaseUrl, customModel, onChange, embedded }) {
  const selectedProvider = AUTH_PROVIDERS.find(p =>
    p.methods.some(m => m.id === authChoice)
  ) || AUTH_PROVIDERS[0]

  const isExperimentalSelected = EXPERIMENTAL_PROVIDERS.some(p => p.id === selectedProvider.id)
  const [showExperimental, setShowExperimental] = useState(isExperimentalSelected)

  const [discoveredModels, setDiscoveredModels] = useState([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState('')
  const debounceRef = useRef(null)

  // Discover models when AkashML is selected and API key is provided
  useEffect(() => {
    if (selectedProvider.id !== 'akashml' || !authSecret?.trim()) {
      setDiscoveredModels([])
      setModelsError('')
      return
    }

    const baseUrl = customBaseUrl?.trim() || 'https://api.akashml.com/v1'

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
          body: JSON.stringify({ baseUrl, apiKey: authSecret.trim() }),
        })

        const contentType = res.headers.get('content-type')
        if (!contentType || !contentType.includes('application/json')) {
          setDiscoveredModels([])
          setModelsLoading(false)
          return
        }

        const text = await res.text()
        if (!text) {
          setDiscoveredModels([])
          setModelsLoading(false)
          return
        }

        const data = JSON.parse(text)

        if (data.ok && data.models?.length > 0) {
          setDiscoveredModels(data.models)
          if (!customModel || customModel === 'MiniMaxAI/MiniMax-M2.5') {
            const preferred = data.models.find(m => m.id.includes('MiniMax-M2.5')) || data.models.find(m => m.id.includes('DeepSeek-V3.2'))
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
        if (!import.meta.env.DEV) {
          setModelsError(err.message)
        }
      } finally {
        setModelsLoading(false)
      }
    }, 800)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [selectedProvider.id, authSecret])

  const handleProviderSelect = (providerId) => {
    const provider = AUTH_PROVIDERS.find(p => p.id === providerId)
    if (provider?.methods[0]) {
      onChange('authChoice', provider.methods[0].id)
      setDiscoveredModels([])
      setModelsError('')

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
  const hasMultipleMethods = selectedProvider.methods.length > 1

  const content = (
    <>
      {/* Provider selector */}
      <div className="provider-label" style={embedded ? { marginTop: 0 } : undefined}>
        Provider
        <Tooltip text="Select your AI model provider. AkashML is recommended for decentralized inference." />
      </div>
      <div className="provider-selector">
        <button
          type="button"
          className={`provider-btn ${selectedProvider.id === 'akashml' ? 'active' : ''}`}
          onClick={() => { handleProviderSelect('akashml'); setShowExperimental(false) }}
        >
          AkashML
        </button>
        <button
          type="button"
          className={`provider-btn provider-btn-experimental ${showExperimental && selectedProvider.id !== 'akashml' ? 'active' : ''}`}
          onClick={() => setShowExperimental(prev => !prev)}
        >
          Other (Experimental) {showExperimental ? '▴' : '▾'}
        </button>
      </div>

      {/* AkashML promo */}
      {selectedProvider.id === 'akashml' && (
        <div className="akashml-promo">
          Get <strong>$100 in free credits</strong> when you sign up at{' '}
          <a href="https://akashml.com" target="_blank" rel="noopener noreferrer">akashml.com</a>
        </div>
      )}

      {/* Experimental providers */}
      {showExperimental && (
        <div className="provider-selector experimental-providers">
          {EXPERIMENTAL_PROVIDERS.map(p => (
            <button
              key={p.id}
              type="button"
              className={`provider-btn ${selectedProvider.id === p.id ? 'active' : ''}`}
              onClick={() => handleProviderSelect(p.id)}
            >
              {p.name}
            </button>
          ))}
          <div className="experimental-hint">
            These providers may have limited support. For the best experience, use AkashML.
          </div>
        </div>
      )}

      {/* Auth method - only show if provider has multiple methods */}
      {!isCustom && hasMultipleMethods && (
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
        </>
      )}

      {/* API Key for non-custom providers */}
      {!isCustom && (
        <>
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

      {/* AkashML fields: API key first, then model dropdown */}
      {isCustom && isAkashML && (
        <>
          <label>
            API Key
            <Tooltip text="Your AkashML API key. Enter it to load available models." />
          </label>
          <input
            type="password"
            value={authSecret}
            onChange={(e) => onChange('authSecret', e.target.value)}
            placeholder="akml-..."
          />

          <label>
            Model
            <Tooltip text="Select a model from AkashML. Models are loaded once you enter your API key." />
          </label>
          {modelsLoading && (
            <div className="model-hint">Discovering available models...</div>
          )}
          {modelsError && !modelsLoading && (
            <div className="model-hint error">Discovery failed: {modelsError}</div>
          )}
          {discoveredModels.length > 0 ? (
            <select
              value={customModel || ''}
              onChange={(e) => onChange('customModel', e.target.value)}
            >
              {discoveredModels.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.reasoning ? ' (reasoning)' : ''}
                </option>
              ))}
            </select>
          ) : !modelsLoading && (
            <select disabled>
              <option>Enter API key to load models</option>
            </select>
          )}
          <div className="model-hint">You can change the model later in the Config Editor.</div>
        </>
      )}

      {/* Custom (non-AkashML) provider fields */}
      {isCustom && !isAkashML && (
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
            Model
            <Tooltip text="The model identifier as expected by the API. Check your provider's docs for available models." />
          </label>
          <input
            type="text"
            value={customModel || ''}
            onChange={(e) => onChange('customModel', e.target.value)}
            placeholder="org/model-name or model-id"
          />

          <label>
            API Key
            <Tooltip text="Your secret API key. Some local servers (like Ollama) may not require this." />
          </label>
          <input
            type="password"
            value={authSecret}
            onChange={(e) => onChange('authSecret', e.target.value)}
            placeholder="sk-..."
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
