import React, { createContext, useContext, useState, useEffect } from 'react';

export const THEMES = [
  {
    id: 'neon-night',
    name: 'Neon Night',
    icon: '⚡',
    description: 'Cyberpunk dark mode with cyan and magenta neon accents',
  },
  {
    id: 'paper-zine',
    name: 'Paper Zine',
    icon: '📰',
    description: 'Warm tactile newsprint, ink textures, and raw DIY brutalism',
  },
  {
    id: 'terminal',
    name: 'Terminal',
    icon: '📟',
    description: 'Phosphor green CRT hacker terminal with monospaced precision',
  },
  {
    id: 'vaporwave',
    name: 'Vaporwave',
    icon: '🌴',
    description: 'Pastel magenta and dusky indigo 80s retro-futurism',
  },
];

const THEME_STORAGE_KEY = 'oddspot_theme';
const DEFAULT_THEME = 'neon-night';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved && THEMES.some((t) => t.id === saved)) {
        return saved;
      }
    } catch {
      // Fallback on restricted localStorage
    }
    return DEFAULT_THEME;
  });

  useEffect(() => {
    // Apply theme to document root
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.remove(...THEMES.map((t) => `theme-${t.id}`));
    document.documentElement.classList.add(`theme-${theme}`);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage write failures
    }
  }, [theme]);

  const setTheme = (themeId) => {
    if (THEMES.some((t) => t.id === themeId)) {
      setThemeState(themeId);
    }
  };

  const cycleTheme = () => {
    const currentIndex = THEMES.findIndex((t) => t.id === theme);
    const nextIndex = (currentIndex + 1) % THEMES.length;
    setTheme(THEMES[nextIndex].id);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        cycleTheme,
        themes: THEMES,
        currentThemeMeta: THEMES.find((t) => t.id === theme) || THEMES[0],
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
