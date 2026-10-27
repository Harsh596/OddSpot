import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api';

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

export const THEME_PRESETS = {
  'neon-night': {
    id: 'neon-night',
    name: 'Neon Night',
    icon: '⚡',
    description: 'Cyberpunk dark mode with cyan and magenta neon accents',
    colors: {
      '--bg-primary': '#0b0e14',
      '--bg-surface': '#121722',
      '--text-primary': '#f0f4fc',
      '--accent-primary': '#00f0ff',
      '--accent-secondary': '#ff0055',
    },
    font: 'sans',
    neonGlow: true,
  },
  'paper-zine': {
    id: 'paper-zine',
    name: 'Paper Zine',
    icon: '📰',
    description: 'Warm tactile newsprint, ink textures, and raw DIY brutalism',
    colors: {
      '--bg-primary': '#f5f0e6',
      '--bg-surface': '#ebe5d8',
      '--text-primary': '#1c1917',
      '--accent-primary': '#dc2626',
      '--accent-secondary': '#ea580c',
    },
    font: 'zine',
    neonGlow: false,
  },
  terminal: {
    id: 'terminal',
    name: 'Terminal',
    icon: '📟',
    description: 'Phosphor green CRT hacker terminal with monospaced precision',
    colors: {
      '--bg-primary': '#050805',
      '--bg-surface': '#0a120a',
      '--text-primary': '#00ff66',
      '--accent-primary': '#39ff14',
      '--accent-secondary': '#00cc55',
    },
    font: 'mono',
    neonGlow: true,
  },
  vaporwave: {
    id: 'vaporwave',
    name: 'Vaporwave',
    icon: '🌴',
    description: 'Pastel magenta and dusky indigo 80s retro-futurism',
    colors: {
      '--bg-primary': '#18122b',
      '--bg-surface': '#251b3e',
      '--text-primary': '#f5e6ff',
      '--accent-primary': '#ff71ce',
      '--accent-secondary': '#01cdfe',
    },
    font: 'sans',
    neonGlow: true,
  },
};

export const FONT_OPTIONS = [
  { id: 'sans', name: 'Modern Sans', stack: 'var(--font-sans, sans-serif)' },
  { id: 'mono', name: 'Hacker Mono', stack: 'var(--font-mono, monospace)' },
  { id: 'zine', name: 'Typewriter Zine', stack: 'var(--font-zine, monospace)' },
  { id: 'serif', name: 'Editorial Serif', stack: 'var(--font-serif, serif)' },
];

const STORAGE_KEY_V1 = 'oddspot_theme_v1';
const LEGACY_STORAGE_KEY = 'oddspot_theme';

/**
 * Validates hex colors strictly against /^#[0-9a-fA-F]{6}$/ to prevent CSS injection.
 */
export function isValidHexColor(color) {
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color.trim());
}

/**
 * Converts 6-digit hex string (#RRGGBB) to RGB object
 */
export function hexToRgb(hex) {
  if (!isValidHexColor(hex)) return null;
  const num = parseInt(hex.trim().slice(1), 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Calculates WCAG 2.2 relative luminance
 */
export function getRelativeLuminance(rgb) {
  if (!rgb) return 0;
  const [rs, gs, bs] = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map((c) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Computes WCAG 2.2 contrast ratio between two hex colors (e.g. 4.5:1)
 */
export function getContrastRatio(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return 21; // Safe fallback
  const l1 = getRelativeLuminance(rgb1);
  const l2 = getRelativeLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  // Load saved state from localStorage
  const [themeState, setThemeState] = useState(() => {
    try {
      const savedV1 = localStorage.getItem(STORAGE_KEY_V1);
      if (savedV1) {
        const parsed = JSON.parse(savedV1);
        if (parsed && THEME_PRESETS[parsed.preset]) {
          return {
            preset: parsed.preset,
            overrides: parsed.overrides || {},
            font: parsed.font || THEME_PRESETS[parsed.preset].font,
            neonGlow: parsed.neonGlow !== undefined ? parsed.neonGlow : THEME_PRESETS[parsed.preset].neonGlow,
          };
        }
      }
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy && THEME_PRESETS[legacy]) {
        return {
          preset: legacy,
          overrides: {},
          font: THEME_PRESETS[legacy].font,
          neonGlow: THEME_PRESETS[legacy].neonGlow,
        };
      }
    } catch {
      // Fallback
    }
    return {
      preset: 'neon-night',
      overrides: {},
      font: 'sans',
      neonGlow: true,
    };
  });

  const activePreset = THEME_PRESETS[themeState.preset] || THEME_PRESETS['neon-night'];

  // Compute effective colors merging preset with validated user overrides
  const effectiveColors = useMemo(() => {
    const base = { ...activePreset.colors };
    for (const [key, val] of Object.entries(themeState.overrides)) {
      if (isValidHexColor(val)) {
        base[key] = val;
      }
    }
    return base;
  }, [activePreset, themeState.overrides]);

  const effectiveFont = themeState.font || activePreset.font;
  const effectiveGlow = themeState.neonGlow !== undefined ? themeState.neonGlow : activePreset.neonGlow;

  // WCAG Contrast calculation between --bg-primary and --text-primary
  const contrastRatio = useMemo(() => {
    const bg = effectiveColors['--bg-primary'] || '#0b0e14';
    const text = effectiveColors['--text-primary'] || '#f0f4fc';
    return Number(getContrastRatio(bg, text).toFixed(2));
  }, [effectiveColors]);

  const isLowContrast = contrastRatio < 4.5;

  // Apply variables to document root
  useEffect(() => {
    const root = document.documentElement;

    // Set theme attribute and classes
    root.setAttribute('data-theme', themeState.preset);
    root.classList.remove(...THEMES.map((t) => `theme-${t.id}`));
    root.classList.add(`theme-${themeState.preset}`);

    // Apply color CSS variables
    for (const [varName, colorVal] of Object.entries(effectiveColors)) {
      if (isValidHexColor(colorVal)) {
        root.style.setProperty(varName, colorVal);
        // Aliases for seamless backward compatibility across components
        if (varName === '--accent-primary') {
          root.style.setProperty('--accent', colorVal);
          root.style.setProperty('--color-primary', colorVal);
        }
        if (varName === '--accent-secondary') {
          root.style.setProperty('--color-secondary', colorVal);
        }
      }
    }

    // Apply font variables
    const fontObj = FONT_OPTIONS.find((f) => f.id === effectiveFont) || FONT_OPTIONS[0];
    root.style.setProperty('--font-heading', fontObj.stack);
    root.style.setProperty('--font-sans', fontObj.stack);

    // Apply neon glow
    if (effectiveGlow) {
      const glowColor = effectiveColors['--accent-primary'] || '#00f0ff';
      root.style.setProperty('--accent-glow', `0 0 15px ${glowColor}`);
      root.classList.add('glow-enabled');
    } else {
      root.style.setProperty('--accent-glow', 'none');
      root.classList.remove('glow-enabled');
    }

    // Persist to localStorage
    try {
      localStorage.setItem(STORAGE_KEY_V1, JSON.stringify(themeState));
      localStorage.setItem(LEGACY_STORAGE_KEY, themeState.preset);
    } catch {
      // Storage error ignored
    }
  }, [themeState, effectiveColors, effectiveFont, effectiveGlow]);

  // Set preset
  const setTheme = useCallback((presetId) => {
    if (THEME_PRESETS[presetId]) {
      setThemeState({
        preset: presetId,
        overrides: {},
        font: THEME_PRESETS[presetId].font,
        neonGlow: THEME_PRESETS[presetId].neonGlow,
      });
    }
  }, []);

  // Update a single custom color override
  const setColorOverride = useCallback((varName, hexColor) => {
    if (isValidHexColor(hexColor)) {
      setThemeState((prev) => ({
        ...prev,
        overrides: {
          ...prev.overrides,
          [varName]: hexColor.trim(),
        },
      }));
    }
  }, []);

  // Update font family
  const setFontFamily = useCallback((fontId) => {
    if (FONT_OPTIONS.some((f) => f.id === fontId)) {
      setThemeState((prev) => ({
        ...prev,
        font: fontId,
      }));
    }
  }, []);

  // Toggle neon glow
  const setNeonGlow = useCallback((enabled) => {
    setThemeState((prev) => ({
      ...prev,
      neonGlow: Boolean(enabled),
    }));
  }, []);

  // Reset custom overrides back to current preset defaults
  const resetToPreset = useCallback(() => {
    if (THEME_PRESETS[themeState.preset]) {
      setThemeState({
        preset: themeState.preset,
        overrides: {},
        font: THEME_PRESETS[themeState.preset].font,
        neonGlow: THEME_PRESETS[themeState.preset].neonGlow,
      });
    }
  }, [themeState.preset]);

  // Fix low contrast automatically by picking a compliant text color
  const fixContrast = useCallback(() => {
    const bgRgb = hexToRgb(effectiveColors['--bg-primary']);
    const bgLum = getRelativeLuminance(bgRgb);
    // If background is dark, use crisp white text; if background is light, use deep dark slate text
    const compliantTextColor = bgLum < 0.5 ? '#ffffff' : '#111827';
    setColorOverride('--text-primary', compliantTextColor);
  }, [effectiveColors, setColorOverride]);

  // Export theme as shareable code string
  const exportThemeCode = useCallback(() => {
    const payload = {
      version: 1,
      preset: themeState.preset,
      overrides: themeState.overrides,
      font: effectiveFont,
      neonGlow: effectiveGlow,
    };
    return JSON.stringify(payload, null, 2);
  }, [themeState, effectiveFont, effectiveGlow]);

  // Import theme from code string
  const importThemeCode = useCallback((codeString) => {
    try {
      const parsed = typeof codeString === 'string' ? JSON.parse(codeString.trim()) : codeString;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Theme code must be a valid JSON object');
      }

      const preset = THEME_PRESETS[parsed.preset] ? parsed.preset : 'neon-night';
      const cleanOverrides = {};

      if (parsed.overrides && typeof parsed.overrides === 'object') {
        for (const [k, v] of Object.entries(parsed.overrides)) {
          if (isValidHexColor(v)) {
            cleanOverrides[k] = v;
          }
        }
      }

      const font = FONT_OPTIONS.some((f) => f.id === parsed.font)
        ? parsed.font
        : THEME_PRESETS[preset].font;

      const neonGlow = typeof parsed.neonGlow === 'boolean'
        ? parsed.neonGlow
        : THEME_PRESETS[preset].neonGlow;

      setThemeState({
        preset,
        overrides: cleanOverrides,
        font,
        neonGlow,
      });

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, []);

  // Sync to backend user preferences when authenticated
  const syncPreferences = useCallback(async () => {
    try {
      const payload = {
        theme: {
          preset: themeState.preset,
          overrides: themeState.overrides,
          font: effectiveFont,
          neonGlow: effectiveGlow,
        },
      };
      await api.updatePreferences(payload);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, [themeState, effectiveFont, effectiveGlow]);

  // Cycle themes (for navbar quick-toggle)
  const cycleTheme = useCallback(() => {
    const currentIndex = THEMES.findIndex((t) => t.id === themeState.preset);
    const nextIndex = (currentIndex + 1) % THEMES.length;
    setTheme(THEMES[nextIndex].id);
  }, [themeState.preset, setTheme]);

  return (
    <ThemeContext.Provider
      value={{
        theme: themeState.preset,
        preset: themeState.preset,
        activePreset,
        themes: THEMES,
        currentThemeMeta: activePreset,
        effectiveColors,
        effectiveFont,
        effectiveGlow,
        contrastRatio,
        isLowContrast,
        setTheme,
        setColorOverride,
        setFontFamily,
        setNeonGlow,
        resetToPreset,
        fixContrast,
        exportThemeCode,
        importThemeCode,
        syncPreferences,
        cycleTheme,
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
