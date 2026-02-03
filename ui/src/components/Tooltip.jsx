export default function Tooltip({ text }) {
  return (
    <span className="tooltip-icon" data-tooltip={text}>
      <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
        <path d="M4 0C3.4 0 3 0.5 3 1C3 1.5 3.4 2 4 2C4.6 2 5 1.5 5 1C5 0.5 4.6 0 4 0ZM3 3V8H5V3H3Z"/>
      </svg>
    </span>
  )
}
