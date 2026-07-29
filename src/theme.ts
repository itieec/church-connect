import { Platform, StyleSheet, TextStyle, ViewStyle } from 'react-native';

const ios = Platform.OS === 'ios';

/**
 * Design tokens.
 *
 * Two ideas drive the palette. First, the old #1e3a8a/#3b82f6 pair was stock
 * Tailwind blue — instantly recognisable as a default, so the navy is deepened
 * and desaturated into ink. Second, there is exactly one accent (warm brass),
 * and every neutral is tinted warm so the greys belong to one family rather
 * than mixing cool and warm.
 *
 * Layout still adapts per platform: iOS gets grouped inset lists and hairline
 * separators, Android gets Material elevation and ripple.
 */

// ---------- Type families ----------

/**
 * Custom fonts do not synthesise weights reliably on Android, so each weight
 * maps to its own loaded file and `fontWeight` is left unset.
 * Amharic falls to Noto Sans Ethiopic — see `amharic` below.
 */
export const font = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

/** Ethiopic companion. Apply to text known to be Amharic. */
export const amharic = {
  regular: 'NotoSansEthiopic_400Regular',
  medium: 'NotoSansEthiopic_500Medium',
  semibold: 'NotoSansEthiopic_600SemiBold',
  bold: 'NotoSansEthiopic_700Bold',
} as const;

/** Ethiopic codepoint range — used to pick the right family at runtime. */
const ETHIOPIC = /[ሀ-፿]/;

/** Returns the family that can actually render `text` at the given weight. */
export function familyFor(text: string, weight: keyof typeof font = 'regular') {
  return ETHIOPIC.test(text) ? amharic[weight] : font[weight];
}

// ---------- Palette ----------

export const brand = {
  /** Deepened, desaturated navy — ink rather than stock blue. */
  navy: '#1B3055',
  navyDeep: '#12213B',
  navyLight: '#35548C',
  /** The single accent. Warm brass keeps the navy from reading cold. */
  brass: '#C2884A',
};

/** Warm neutral ramp. One family, consistently tinted. */
const neutral = {
  n0: '#FFFFFF',
  n50: '#F7F6F4',
  n100: '#EFEDE9',
  n200: '#E6E3DE',
  n400: '#A8A39C',
  n600: '#6F6B66',
  n900: '#1A1A18',
};

export const colors = {
  // — keys the screens already import —
  primary: brand.navy,
  primaryLight: brand.navyLight,
  bg: neutral.n50,
  card: neutral.n0,
  text: neutral.n900,
  muted: neutral.n600,
  border: neutral.n200,
  success: '#3F7D5C',
  warning: brand.brass,
  danger: '#A8473C',
  purple: '#6B5B95',

  // — added —
  accent: brand.brass,
  tint: brand.navy,
  groupedBg: neutral.n50,
  rowBg: neutral.n0,
  highlight: neutral.n100,
  fill: neutral.n100,
  separator: neutral.n200,
  icon: neutral.n400,
  white: neutral.n0,
};

/** Status hues, desaturated to sit alongside the warm neutrals. */
export const statusColors: Record<string, string> = {
  newcomer: '#3B6CA8',
  follow_up: brand.brass,
  ready: '#B5713C',
  member: '#6B5B95',
  minister: '#3F7D5C',
  inactive: '#8A8580',
};

// ---------- Typography ----------

/**
 * Display sizes carry negative tracking so large text sets tightly; small
 * labels track positive so they stay legible. Weight comes from `fontFamily`.
 */
export const type = {
  largeTitle: { fontFamily: font.bold,     fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  title:      { fontFamily: font.bold,     fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  title2:     { fontFamily: font.bold,     fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  title3:     { fontFamily: font.semibold, fontSize: 19, lineHeight: 25, letterSpacing: -0.3 },
  headline:   { fontFamily: font.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.2 },
  body:       { fontFamily: font.regular,  fontSize: 16, lineHeight: 23, letterSpacing: -0.1 },
  callout:    { fontFamily: font.medium,   fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
  subhead:    { fontFamily: font.regular,  fontSize: 14, lineHeight: 20 },
  footnote:   { fontFamily: font.medium,   fontSize: 13, lineHeight: 18 },
  caption:    { fontFamily: font.medium,   fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  /** Small uppercase section headers. */
  overline:   { fontFamily: font.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.8 },
  button:     { fontFamily: font.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.1 },
} satisfies Record<string, TextStyle>;

/** Lines up digits in tables, totals and stat tiles. */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

// ---------- Metrics ----------

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 40 } as const;

export const radius = {
  card: 18,
  button: 14,
  field: 12,
  pill: 999,
} as const;

export const hairline = StyleSheet.hairlineWidth;
export const touchTarget = ios ? 44 : 48;
export const separatorInset = ios ? 16 : 0;

/**
 * Shadows carry the brand hue rather than pure black, so elevation reads as
 * light falling through the palette instead of a grey smudge.
 */
export function shadow(level: 0 | 1 | 2 | 3 = 1): ViewStyle {
  if (level === 0) return {};
  if (!ios) return { elevation: level };
  const map = {
    1: { radius: 6, y: 2, opacity: 0.06 },
    2: { radius: 14, y: 5, opacity: 0.09 },
    3: { radius: 28, y: 12, opacity: 0.13 },
  }[level];
  return {
    shadowColor: brand.navyDeep,
    shadowOffset: { width: 0, height: map.y },
    shadowOpacity: map.opacity,
    shadowRadius: map.radius,
  };
}

export const isIOS = ios;
