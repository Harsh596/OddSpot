import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api';

export const THEMES = [
  {
    id: 'sunburst',
    name: 'Sunburst (Default)',
    icon: '☀️',
    description: 'Crisp editorial white, sunset orange, and warm marigold yellow',
  },
  {
    id: 'golden-hour',
    name: 'Golden Hour',
    icon: '🌅',
    description: 'Warm honey amber tones and rich glowing marigold',
  },
  {
    id: 'paper-zine',
    name: 'Field Journal',
    icon: '📓',
    description: 'Tactile explorer notebook with ink notes and raw field marks',
  },
  {
    id: 'obsidian-ember',
    name: 'Obsidian Ember',
    icon: '🔥',
    description: 'Rich nocturnal dark mode illuminated by warm amber embers',
  },
];

export const THEME_PRESETS = {
  sunburst: {
    id: 'sunburst',
    name: 'Sunburst',
    icon: '☀️',
    description: 'Crisp editorial white, sunset orange, and warm marigold yellow',
    colors: {
      '--bg-primary': '#FFFDF9',
      '--bg-surface': '#FFFFFF',
      '--bg-elevated': '#FFF3E0',
      '--bg-highlight': '#FFF8E1',
      '--text-primary': '#1A1814',
      '--text-secondary': '#6E675F',
      '--accent-primary': '#FF6F00',
      '--accent-secondary': '#FFB300',
      '--accent-highlight': '#FFF8E1',
      '--border-color': '#E6DFD5',
    },
    font: 'sans',
    neonGlow: false,
  },
  'golden-hour': {
    id: 'golden-hour',
    name: 'Golden Hour',
    icon: '🌅',
    description: 'Warm honey amber tones and rich glowing marigold',
    colors: {
      '--bg-primary': '#FFF8E7',
      '--bg-surface': '#FFFDF9',
      '--bg-elevated': '#FFECC7',
      '--bg-highlight': '#FFF3D0',
      '--text-primary': '#261C12',
      '--text-secondary': '#7A6452',
      '--accent-primary': '#F57C00',
      '--accent-secondary': '#FFA000',
      '--accent-highlight': '#FFF3D0',
      '--border-color': '#E8DBC9',
    },
    font: 'sans',
    neonGlow: false,
  },
  'paper-zine': {
    id: 'paper-zine',
    name: 'Field Journal',
    icon: '📓',
    description: 'Tactile explorer notebook with ink notes and raw field marks',
    colors: {
      '--bg-primary': '#F7F4EB',
      '--bg-surface': '#FFFFFF',
      '--bg-elevated': '#EBE4D3',
      '--bg-highlight': '#FEF3C7',
      '--text-primary': '#1C1917',
      '--text-secondary': '#57534E',
      '--accent-primary': '#D95D00',
      '--accent-secondary': '#D97706',
      '--accent-highlight': '#FEF3C7',
      '--border-color': '#D6CEBE',
    },
    font: 'zine',
    neonGlow: false,
  },
  'obsidian-ember': {
    id: 'obsidian-ember',
    name: 'Obsidian Ember',
    icon: '🔥',
    description: 'Rich nocturnal dark mode illuminated by warm amber embers',
    colors: {
      '--bg-primary': '#12100E',
      '--bg-surface': '#1C1916',
      '--bg-elevated': '#29241E',
      '--bg-highlight': '#2A1D0E',
      '--text-primary': '#FFF9F2',
      '--text-secondary': '#A89F91',
      '--accent-primary': '#FF7A00',
      '--accent-secondary': '#FFB800',
      '--accent-highlight': '#2A1D0E',
      '--border-color': '#383127',
    },
    font: 'sans',
    neonGlow: true,
  },
};

export const FONT_OPTIONS = [
  { id: 'sans', name: 'Plus Jakarta Sans', stack: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)' },
  { id: 'mono', name: 'JetBrains Mono', stack: 'var(--font-mono, monospace)' },
  { id: 'zine', name: 'Field Notes', stack: 'var(--font-zine, monospace)' },
  { id: 'serif', name: 'Editorial Serif', stack: 'var(--font-serif, serif)' },
];

const STORAGE_KEY_V1 = 'oddspot_theme_v2';
const LEGACY_STORAGE_KEY = 'oddspot_theme';

import {
  isValidHexColor,
  hexToRgb,
  getRelativeLuminance,
  getContrastRatio,
} from '../utils/themeValidator';

export {
  isValidHexColor,
  hexToRgb,
  getRelativeLuminance,
  getContrastRatio,
};

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
      preset: 'sunburst',
      overrides: {},
      font: 'sans',
      neonGlow: false,
    };
  });

  const activePreset = THEME_PRESETS[themeState.preset] || THEME_PRESETS.sunburst;

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
