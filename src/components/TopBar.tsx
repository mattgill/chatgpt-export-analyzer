import { useTheme } from '../hooks/useTheme'

export function TopBar() {
  const { theme, toggleTheme } = useTheme()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  return <header className="top-bar"><div className="top-bar-inner"><LinkBrand /><button className="theme-toggle" type="button" onClick={toggleTheme} aria-pressed={theme === 'dark'} aria-label={`Switch to ${nextTheme} mode`}><span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span><span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span></button></div></header>
}

function LinkBrand() {
  return <a className="brand" href="#/" aria-label="ChatGPT Export Analytics home">ChatGPT Export Analytics</a>
}
