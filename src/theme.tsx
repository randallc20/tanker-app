import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { ThemeProvider as MuiThemeProvider, CssBaseline } from '@mui/material';
import { createAppTheme } from './theme/muiTheme';

type Mode = 'light' | 'dark';

const ThemeModeContext = createContext<{ mode: Mode; toggle: () => void }>({
  mode: 'light',
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>(() => {
    try {
      const saved = localStorage.getItem('tanker-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {}
    return 'light';
  });

  useEffect(() => {
    try { localStorage.setItem('tanker-theme', mode); } catch {}
  }, [mode]);

  const toggle = () => setMode(m => (m === 'dark' ? 'light' : 'dark'));
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  return (
    <ThemeModeContext.Provider value={{ mode, toggle }}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode() {
  return useContext(ThemeModeContext);
}
