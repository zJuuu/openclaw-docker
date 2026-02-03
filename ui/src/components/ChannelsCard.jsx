import Tooltip from './Tooltip'

export default function ChannelsCard({ config, onChange, embedded }) {
  const content = (
    <>
      <label style={embedded ? { marginTop: 0 } : undefined}>
        Telegram Bot Token
        <Tooltip text="Create a bot via @BotFather on Telegram. Send /newbot and follow the prompts to get your token." />
      </label>
      <input
        type="password"
        value={config.telegramToken}
        onChange={(e) => onChange('telegramToken', e.target.value)}
        placeholder="123456789:ABCdef..."
      />

      <label>
        Discord Bot Token
        <Tooltip text="From Discord Developer Portal → Your App → Bot → Token. Enable MESSAGE CONTENT INTENT under Privileged Gateway Intents." />
      </label>
      <input
        type="password"
        value={config.discordToken}
        onChange={(e) => onChange('discordToken', e.target.value)}
        placeholder="MTIz...xyz"
      />

      <label>
        Slack Bot Token
        <Tooltip text="From Slack API → Your App → OAuth & Permissions → Bot User OAuth Token. Requires chat:write and app_mentions:read scopes." />
      </label>
      <input
        type="password"
        value={config.slackBotToken}
        onChange={(e) => onChange('slackBotToken', e.target.value)}
        placeholder="xoxb-..."
      />

      <label>
        Slack App Token
        <Tooltip text="From Slack API → Your App → Basic Information → App-Level Tokens. Create with connections:write scope for Socket Mode." />
      </label>
      <input
        type="password"
        value={config.slackAppToken}
        onChange={(e) => onChange('slackAppToken', e.target.value)}
        placeholder="xapp-..."
      />
    </>
  )

  if (embedded) {
    return content
  }

  return (
    <div className="card">
      <h2>Messaging Channels</h2>
      <p className="hint">
        Configure bot integrations. You can also add these later in the Control Panel.
      </p>
      {content}
    </div>
  )
}
