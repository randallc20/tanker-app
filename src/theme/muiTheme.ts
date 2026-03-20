import { createTheme } from '@mui/material/styles';

export function createAppTheme(mode: 'light' | 'dark') {
  return createTheme({
    palette: {
      mode,
      primary: { main: '#1e3a5f' },
      secondary: { main: '#3b82f6' },
      success: { main: '#22c55e' },
      error: { main: '#ef4444' },
      warning: { main: '#f59e0b' },
      background: mode === 'light'
        ? { default: '#f5f6f8', paper: '#fff' }
        : { default: '#0f1117', paper: '#181b23' },
    },
    typography: {
      fontFamily: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      allVariants: { fontVariantNumeric: 'tabular-nums' },
    },
    components: {
      MuiCard: {
        styleOverrides: {
          root: { borderRadius: 12 },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: { '& .MuiInputBase-root': { minHeight: 44 } },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: { textTransform: 'none' as const },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 999 },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { padding: '6px 12px' },
        },
      },
    },
  });
}
