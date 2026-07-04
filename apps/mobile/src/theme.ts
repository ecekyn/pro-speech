import { ViewStyle } from 'react-native';

export const colors = {
  ink: '#13152A',
  inkMuted: '#565B72',
  inkFaint: '#8B90A3',
  onAccent: '#FFFFFF',
  onAccentMuted: 'rgba(255, 255, 255, 0.78)',

  hairline: 'rgba(19, 21, 42, 0.09)',
  hairlineStrong: 'rgba(19, 21, 42, 0.15)',

  glassFill: 'rgba(255, 255, 255, 0.5)',
  glassFillStrong: 'rgba(255, 255, 255, 0.7)',
  glassFillSoft: 'rgba(255, 255, 255, 0.32)',
  glassFillOpaque: 'rgba(255, 255, 255, 0.96)',
  glassBorder: 'rgba(255, 255, 255, 0.6)',
  glassHighlight: 'rgba(255, 255, 255, 0.92)',

  indigo: '#4C5FE8',
  indigoDeep: '#2E3AB8',
  indigoTint: 'rgba(76, 95, 232, 0.12)',

  teal: '#0EA8A0',
  tealDeep: '#0A7E78',
  tealTint: 'rgba(14, 168, 160, 0.14)',

  coral: '#E1544F',
  coralDeep: '#B93E3B',
  coralTint: 'rgba(225, 84, 79, 0.12)',

  amber: '#C57F14',
  amberTint: 'rgba(197, 127, 20, 0.14)',

  green: '#189A6C',
  greenTint: 'rgba(24, 154, 108, 0.13)',
} as const;

export const gradients = {
  screen: 'linear-gradient(165deg, #EEF2FF 0%, #F1ECFB 45%, #EAFBF6 100%)',
  primary: 'linear-gradient(135deg, #5A6CF0 0%, #12ACA3 100%)',
  danger: 'linear-gradient(135deg, #EE6F63 0%, #D5433F 100%)',
  blobIndigo:
    'radial-gradient(circle, rgba(90, 108, 240, 0.40) 0%, rgba(90, 108, 240, 0) 70%)',
  blobTeal:
    'radial-gradient(circle, rgba(18, 172, 163, 0.36) 0%, rgba(18, 172, 163, 0) 70%)',
  blobCoral:
    'radial-gradient(circle, rgba(238, 111, 99, 0.26) 0%, rgba(238, 111, 99, 0) 70%)',
} as const;

export const radii = {
  sm: 14,
  md: 18,
  lg: 24,
  xl: 28,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
};

// Frosted-glass surface presets. Layered translucency + a soft tinted
// drop shadow + a 1px inset highlight along the top edge stand in for a
// true backdrop blur (RN has no backdrop-filter), which keeps this
// dependency-free while still reading as "glass".
export const glass: Record<string, ViewStyle> = {
  panel: {
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radii.xl,
    boxShadow: [
      { offsetX: 0, offsetY: 18, blurRadius: 36, color: 'rgba(41, 49, 110, 0.14)' },
      {
        offsetX: 0,
        offsetY: 1,
        blurRadius: 0,
        color: 'rgba(255, 255, 255, 0.75)',
        inset: true,
      },
    ],
  },
  panelSoft: {
    backgroundColor: colors.glassFill,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radii.lg,
    boxShadow: [
      { offsetX: 0, offsetY: 10, blurRadius: 22, color: 'rgba(41, 49, 110, 0.1)' },
    ],
  },
  // Used for elements that float over scrolling content (the tab bar) rather
  // than the static backdrop. Needs to be near-opaque: without real
  // backdrop-blur, translucent text scrolling underneath stays fully
  // legible and collides with the label on top of it.
  floating: {
    backgroundColor: colors.glassFillOpaque,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radii.pill,
    boxShadow: [
      { offsetX: 0, offsetY: 14, blurRadius: 30, color: 'rgba(41, 49, 110, 0.22)' },
      {
        offsetX: 0,
        offsetY: 1,
        blurRadius: 0,
        color: 'rgba(255, 255, 255, 0.75)',
        inset: true,
      },
    ],
  },
};
