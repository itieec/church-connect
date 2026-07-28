import { Platform, StyleSheet, TextStyle, ViewStyle } from 'react-native';

const ios = Platform.OS === 'ios';

/**
 * Design tokens.
 *
 * The look is platform-adaptive rather than one style painted on both:
 * iOS follows the Human Interface Guidelines (grouped inset lists, SF type
 * scale, hairline separators), Android follows Material 3 (elevation, ripple,
 * full-bleed rows). The brand navy carries across both.
 */

// ---------- Palette ----------

/** Apple system colors, light appearance. */
const systemIOS = {
  blue: '#007AFF',
  green: '#34C759',
  red: '#FF3B30',
  orange: '#FF9500',
  purple: '#AF52DE',
  gray: '#8E8E93',
  gray3: '#C7C7CC',
  gray5: '#E5E5EA',
  gray6: '#F2F2F7',
  label: '#000000',
  secondaryLabel: 'rgba(60,60,67,0.60)',
  separator: 'rgba(60,60,67,0.29)',
};

/** Material 3 baseline, light scheme. */
const systemAndroid = {
  blue: '#1A73E8',
  green: '#146C2E',
  red: '#B3261E',
  orange: '#E37400',
  purple: '#6750A4',
  gray: '#5F6368',
  gray3: '#C4C7C5',
  gray5: '#E3E3E3',
  gray6: '#F7F9FC',
  label: '#1B1B1F',
  secondaryLabel: '#44474F',
  separator: '#E1E2EC',
};

const sys = ios ? systemIOS : systemAndroid;

/** Brand identity — constant across platforms. */
export const brand = {
  navy: '#1e3a8a',
  navyLight: '#3b82f6',
};

/**
 * Semantic colors.
 * Every key the existing screens already import is preserved.
 */
export const colors = {
  // — existing keys, kept so all screens keep working —
  primary: brand.navy,
  primaryLight: brand.navyLight,
  bg: sys.gray6,
  card: '#ffffff',
  text: sys.label,
  muted: sys.secondaryLabel,
  border: sys.separator,
  success: sys.green,
  warning: sys.orange,
  danger: sys.red,
  purple: sys.purple,

  // — added —
  /** Tint for interactive text/icons. iOS leans on system blue. */
  tint: ios ? systemIOS.blue : brand.navy,
  /** Page background behind grouped lists. */
  groupedBg: sys.gray6,
  /** Row background inside a grouped list. */
  rowBg: '#ffffff',
  /** Pressed-state overlay for iOS (Android uses ripple instead). */
  highlight: sys.gray5,
  /** Filled control that isn't the primary action. */
  fill: ios ? 'rgba(120,120,128,0.12)' : systemAndroid.gray5,
  separator: sys.separator,
  icon: sys.gray,
  white: '#ffffff',
};

export const statusColors: Record<string, string> = {
  newcomer: sys.blue,
  follow_up: sys.orange,
  ready: ios ? '#FF9F0A' : '#E37400',
  member: sys.purple,
  minister: sys.green,
  inactive: sys.gray,
};

// ---------- Typography ----------

/**
 * Type scale. Named for the iOS text styles; the Android column carries
 * Material 3 sizing and its slightly positive label tracking.
 *
 * fontFamily is deliberately unset — the platform default (San Francisco /
 * Roboto) is exactly what "native" means here.
 */
export const type = {
  largeTitle: pick({ fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: 0.37 },
                   { fontSize: 32, lineHeight: 40, fontWeight: '700' }),
  title:      pick({ fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: 0.36 },
                   { fontSize: 24, lineHeight: 32, fontWeight: '600' }),
  title2:     pick({ fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: 0.35 },
                   { fontSize: 22, lineHeight: 28, fontWeight: '600' }),
  title3:     pick({ fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: 0.38 },
                   { fontSize: 18, lineHeight: 24, fontWeight: '600' }),
  /** Emphasised body — row titles, list headers. */
  headline:   pick({ fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.41 },
                   { fontSize: 16, lineHeight: 24, fontWeight: '600', letterSpacing: 0.15 }),
  body:       pick({ fontSize: 17, lineHeight: 22, fontWeight: '400', letterSpacing: -0.41 },
                   { fontSize: 16, lineHeight: 24, fontWeight: '400', letterSpacing: 0.5 }),
  callout:    pick({ fontSize: 16, lineHeight: 21, fontWeight: '400', letterSpacing: -0.32 },
                   { fontSize: 15, lineHeight: 20, fontWeight: '400' }),
  subhead:    pick({ fontSize: 15, lineHeight: 20, fontWeight: '400', letterSpacing: -0.24 },
                   { fontSize: 14, lineHeight: 20, fontWeight: '400', letterSpacing: 0.25 }),
  footnote:   pick({ fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: -0.08 },
                   { fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: 0.25 }),
  caption:    pick({ fontSize: 12, lineHeight: 16, fontWeight: '400' },
                   { fontSize: 12, lineHeight: 16, fontWeight: '400', letterSpacing: 0.4 }),
  /** Button labels. Material tracks these out; iOS does not. */
  button:     pick({ fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.41 },
                   { fontSize: 14, lineHeight: 20, fontWeight: '500', letterSpacing: 0.1 }),
};

function pick(i: TextStyle, a: TextStyle): TextStyle {
  return ios ? i : a;
}

// ---------- Metrics ----------

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = {
  /** Grouped list containers and cards. */
  card: ios ? 10 : 16,
  /** Buttons. Material uses a full pill. */
  button: ios ? 12 : 20,
  field: ios ? 10 : 12,
  pill: 999,
} as const;

/** 1 physical pixel — the separator weight iOS actually uses. */
export const hairline = StyleSheet.hairlineWidth;

/** Minimum comfortable touch target (44pt iOS / 48dp Android). */
export const touchTarget = ios ? 44 : 48;

/** Leading inset for separators, so they align with row text rather than the edge. */
export const separatorInset = ios ? 16 : 0;

/**
 * Elevation. iOS gets a soft ambient shadow; Android uses the real
 * elevation prop so it picks up the system's shadow rendering.
 */
export function shadow(level: 0 | 1 | 2 | 3 = 1): ViewStyle {
  if (level === 0) return {};
  if (!ios) return { elevation: level };
  const map = {
    1: { radius: 3, y: 1, opacity: 0.08 },
    2: { radius: 8, y: 2, opacity: 0.10 },
    3: { radius: 16, y: 6, opacity: 0.14 },
  }[level];
  return {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: map.y },
    shadowOpacity: map.opacity,
    shadowRadius: map.radius,
  };
}

export const isIOS = ios;
