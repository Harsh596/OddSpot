import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api';

export const THEMES = [
  {
    id: 'sunburst',
    name: 'Sunburst Accessible',
    icon: '☀️',
    badge: 'WARM LIGHT',
    ratio: '7.34:1',
    description: 'High-glare field expedition paper & burnt terracotta',
  },
  {
    id: 'golden-hour',
    name: 'Parchment Ledger',
    icon: '📜',
    badge: 'SEPIA PAPER',
    ratio: '9.2:1',
    description: 'Unbleached fibers, iron gall ink & sepia seals',
  },
  {
    id: 'field-zine',
    name: 'Basalt Core / Field Zine',
    icon: '📓',
    badge: 'EXPEDITION',
    ratio: '9.5:1',
    description: 'Volcanic grey, olivine crystal green & slate sediment',
  },
  {
    id: 'cryptid-moss',
    name: 'Ochre Quarry / Cryptid Moss',
    icon: '🌿',
    badge: 'EARTHY LIGHT',
    ratio: '8.4:1',
    description: 'Raw sienna, clay dust, oxidized copper highlights',
  },
  {
    id: 'nocturnal-phosphor',
    name: 'Nocturnal Phosphor / Verdigris',
    icon: '🟢',
    badge: 'MINERAL SLATE',
    ratio: '11.4:1',
    description: 'High-contrast night vision green phosphor against obsidian',
  },
  {
    id: 'obsidian-ember',
    name: 'Obsidian Ember / Crimson',
    icon: '🔥',
    badge: 'DEEP DARK',
    ratio: '9.6:1',
    description: 'Aviation night cockpit preserve-vision crimson spectrum',
  },
  {
    id: 'subterranean-crypt',
    name: 'Subterranean Crypt / Moss',
    icon: '💎',
    badge: 'DEEP COLD',
    ratio: '7.1:1',
    description: 'Botanical specimen mounts, lichen yellow, pressed fern',
  },
  {
    id: 'sonar-midnight',
    name: 'Sonar Midnight / Slate Fog',
    icon: '🌊',
    badge: 'DEEP SEA',
    ratio: '8.9:1',
    description: 'Misty highland telemetry, wet river stone & cold manganese',
  },
];

export const THEME_PRESETS = {
  sunburst: {
    id: 'sunburst',
    name: 'Sunburst Accessible',
    icon: '☀️',
    badge: 'WARM LIGHT',
    ratio: '7.34:1',
    description: 'High-glare field expedition paper & burnt terracotta',
    colors: {
      '--bg-primary': '#FFFDF9',
      '--bg-surface': '#FFFFFF',
      '--bg-elevated': '#FFF3E0',
      '--bg-highlight': '#FFF8E1',
      '--text-primary': '#1A1814',
      '--text-secondary': '#6E675F',
      '--text-muted': '#6E675F',
      '--text-on-accent': '#FFFFFF',
      '--accent-primary': '#FF6F00',
      '--accent-secondary': '#FFB300',
      '--accent-cta': '#C2410C',
      '--border-color': '#E6DFD5',
      '--border-accent': '#FFCC80',
    },
    font: 'serif',
    neonGlow: false,
  },
  'golden-hour': {
    id: 'golden-hour',
    name: 'Parchment Ledger',
    icon: '📜',
    badge: 'SEPIA PAPER',
    ratio: '9.2:1',
    description: 'Unbleached fibers, iron gall ink & sepia seals',
    colors: {
      '--bg-primary': '#F7F4EB',
      '--bg-surface': '#FFFFFF',
      '--bg-elevated': '#E8E0CE',
      '--bg-highlight': '#FEF3C7',
      '--text-primary': '#1C1917',
      '--text-secondary': '#44403C',
      '--accent-primary': '#D97706',
      '--accent-secondary': '#B45309',
      '--accent-cta': '#B45309',
      '--border-color': '#D6CEBE',
    },
    font: 'serif',
    neonGlow: false,
  },
  'field-zine': {
    id: 'field-zine',
    name: 'Basalt Core / Field Zine',
    icon: '📓',
    badge: 'EXPEDITION',
    ratio: '9.5:1',
    description: 'Volcanic grey, olivine crystal green & slate sediment',
    colors: {
      '--bg-primary': '#F4F1EA',
      '--bg-surface': '#FFFFFF',
      '--bg-elevated': '#DFD8CB',
      '--bg-highlight': '#FEF3C7',
      '--text-primary': '#1C1917',
      '--text-secondary': '#44403C',
      '--accent-primary': '#D95D00',
      '--accent-secondary': '#D97706',
      '--accent-cta': '#9A3412',
      '--border-color': '#D6CEBE',
    },
    font: 'zine',
    neonGlow: false,
  },
  'cryptid-moss': {
    id: 'cryptid-moss',
    name: 'Ochre Quarry / Cryptid Moss',
    icon: '🌿',
    badge: 'EARTHY LIGHT',
    ratio: '8.4:1',
    description: 'Raw sienna, clay dust, oxidized copper highlights',
    colors: {
      '--bg-primary': '#F2F5ED',
      '--bg-surface': '#FFFFFF',
      '--bg-elevated': '#DCE3D1',
      '--bg-highlight': '#EBF3E3',
      '--text-primary': '#192416',
      '--text-secondary': '#3D4F38',
      '--accent-primary': '#2D5A27',
      '--accent-secondary': '#658147',
      '--accent-cta': '#2D5A27',
      '--border-color': '#D1DCC6',
    },
    font: 'sans',
    neonGlow: false,
  },
  'nocturnal-phosphor': {
    id: 'nocturnal-phosphor',
    name: 'Nocturnal Phosphor',
    icon: '🟢',
    badge: 'MINERAL SLATE',
    ratio: '11.4:1',
    description: 'High-contrast night vision green phosphor against obsidian',
    colors: {
      '--bg-primary': '#111A16',
      '--bg-surface': '#19241F',
      '--bg-elevated': '#2A3B34',
      '--bg-highlight': '#1B352A',
      '--text-primary': '#F0FDF4',
      '--text-secondary': '#A7F3D0',
      '--accent-primary': '#10B981',
      '--accent-secondary': '#34D399',
      '--accent-cta': '#059669',
      '--border-color': '#2D4238',
    },
    font: 'mono',
    neonGlow: true,
  },
  'obsidian-ember': {
    id: 'obsidian-ember',
    name: 'Obsidian Ember',
    icon: '🔥',
    badge: 'DEEP DARK',
    ratio: '9.6:1',
    description: 'Rich nocturnal dark mode illuminated by warm amber embers',
    colors: {
      '--bg-primary': '#12100E',
      '--bg-surface': '#1C1916',
      '--bg-elevated': '#2C2620',
      '--bg-highlight': '#3A2E20',
      '--text-primary': '#FFF9F2',
      '--text-secondary': '#A89F91',
      '--accent-primary': '#FF7A00',
      '--accent-secondary': '#FFB800',
      '--accent-cta': '#EA580C',
      '--border-color': '#383127',
    },
    font: 'sans',
    neonGlow: true,
  },
  'subterranean-crypt': {
    id: 'subterranean-crypt',
    name: 'Subterranean Crypt',
    icon: '💎',
    badge: 'DEEP COLD',
    ratio: '7.1:1',
    description: 'Botanical specimen mounts, lichen yellow, pressed fern',
    colors: {
      '--bg-primary': '#0F141C',
      '--bg-surface': '#17202A',
      '--bg-elevated': '#283748',
      '--bg-highlight': '#1B3148',
      '--text-primary': '#F0F9FF',
      '--text-secondary': '#BAE6FD',
      '--accent-primary': '#0284C7',
      '--accent-secondary': '#38BDF8',
      '--accent-cta': '#0284C7',
      '--border-color': '#2D3E52',
    },
    font: 'mono',
    neonGlow: true,
  },
  'sonar-midnight': {
    id: 'sonar-midnight',
    name: 'Sonar Midnight',
    icon: '🌊',
    badge: 'DEEP SEA',
    ratio: '8.9:1',
    description: 'Misty highland telemetry, wet river stone & cold manganese',
    colors: {
      '--bg-primary': '#0C1017',
      '--bg-surface': '#131A24',
      '--bg-elevated': '#243042',
      '--bg-highlight': '#182B44',
      '--text-primary': '#F8FAFC',
      '--text-secondary': '#CBD5E1',
      '--accent-primary': '#3B82F6',
      '--accent-secondary': '#60A5FA',
      '--accent-cta': '#2563EB',
      '--border-color': '#2A374A',
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
    const bg = effectiveColors['--bg-primary'] || '#FFFDF9';
    const text = effectiveColors['--text-primary'] || '#1A1814';
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
      const glowColor = effectiveColors['--accent-primary'] || '#FF6F00';
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
