import './SocialLinks.css';

// Platforms an artist can link on their profile (same keys the server accepts).
export const SOCIAL_PLATFORMS = [
  { key: 'instagram', label: 'Instagram', placeholder: 'instagram.com/yourname' },
  { key: 'facebook', label: 'Facebook', placeholder: 'facebook.com/yourpage' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'tiktok.com/@yourname' },
  { key: 'x', label: 'X', placeholder: 'x.com/yourname' },
  { key: 'youtube', label: 'YouTube', placeholder: 'youtube.com/@yourchannel' },
  { key: 'threads', label: 'Threads', placeholder: 'threads.com/@yourname' },
  { key: 'spotify', label: 'Spotify', placeholder: 'open.spotify.com/artist/…' },
  { key: 'appleMusic', label: 'Apple Music', placeholder: 'music.apple.com/…' },
  { key: 'website', label: 'Website', placeholder: 'yourwebsite.com' }
];

export function SocialIcon({ platform }) {
  const p = { viewBox: '0 0 24 24', 'aria-hidden': 'true' };
  switch (platform) {
    case 'instagram': return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.8" r="1" fill="currentColor" stroke="none" /></svg>;
    case 'tiktok': return <svg {...p}><path d="M14 3v11.2a4 4 0 1 1-3.5-4v3a1.2 1.2 0 1 0 .5 1V3h3c.4 2.4 1.8 3.8 4 4.2v3.1A8 8 0 0 1 14 8.5" /></svg>;
    case 'x': return <svg {...p}><path d="M4 3h4.5l11.5 18h-4.5L4 3Zm0 18 7-8m2-2 7-8" /></svg>;
    case 'youtube': return <svg {...p}><rect x="2.5" y="5" width="19" height="14" rx="4" /><path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" /></svg>;
    case 'spotify': return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M6.5 9.5c4.4-1.3 8.7-.8 11.6 1M7.5 12.5c3.4-1 6.8-.6 9.3.8M8.5 15.4c2.6-.7 5-.4 6.9.7" /></svg>;
    case 'appleMusic': return <svg {...p}><path d="M16.8 4.5v12.1a2.8 2.8 0 1 1-1.8-2.6V8.1l-6.1 1.3v8.4a2.8 2.8 0 1 1-1.8-2.6V7.9l9.7-2.1Z" /></svg>;
    case 'threads': return <svg {...p}><path d="M17.7 10.6C17.2 7.4 15.1 5.5 12 5.5c-3.3 0-5.5 2.5-5.5 6.5s2.2 6.5 5.6 6.5c2.9 0 4.6-1.5 4.6-3.4 0-2.1-1.8-3.2-4.3-3.2-1.7 0-2.8.8-2.8 2 0 1 .9 1.7 2.2 1.7 1.8 0 3-1.3 3-3.6v-.6" /></svg>;
    case 'website': return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9s1.3-6.4 3.9-9Z" /></svg>;
    default: return <svg {...p}><path d="M13.5 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5h1.7V3.9c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.2V10H7.7v3h2.7v8z" fill="currentColor" stroke="none" /></svg>; // facebook
  }
}

// Row of link buttons; renders nothing when no link is set.
export function SocialLinks({ links }) {
  const shown = SOCIAL_PLATFORMS.filter(({ key }) => links?.[key]);
  if (!shown.length) return null;
  return (
    <div className="sl-row">
      {shown.map(({ key, label }) => (
        <a key={key} className="sl-link" href={links[key]} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
          <SocialIcon platform={key} /><span>{label}</span>
        </a>
      ))}
    </div>
  );
}

// One input per platform. value = { instagram: '…', … }, onChange gets the whole updated object.
export function SocialLinksFields({ value = {}, onChange, idPrefix = 'sl' }) {
  return (
    <div className="sl-fields">
      {SOCIAL_PLATFORMS.map(({ key, label, placeholder }) => (
        <label className="sl-field" key={key} htmlFor={`${idPrefix}-${key}`}>
          <span className="sl-field-label"><SocialIcon platform={key} />{label}</span>
          <input
            id={`${idPrefix}-${key}`}
            className="sl-input"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            maxLength={300}
            placeholder={placeholder}
            value={value[key] || ''}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          />
        </label>
      ))}
    </div>
  );
}
