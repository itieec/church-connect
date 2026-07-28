import React from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TextInputProps,
  ViewStyle,
  StyleProp,
} from 'react-native';
import {
  colors,
  statusColors,
  type,
  spacing,
  radius,
  hairline,
  touchTarget,
  separatorInset,
  shadow,
  isIOS,
} from '@/theme';

/**
 * Shared UI primitives.
 *
 * iOS renders grouped inset lists with hairline separators; Android renders
 * full-bleed rows with ripple feedback. Components that existed before keep
 * their original props so screens did not need rewriting.
 */

// ---------- Pressable helper ----------

/** Ripple on Android, opacity dim on iOS — the feedback each platform expects. */
function Touchable({
  children,
  onPress,
  disabled,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      android_ripple={onPress ? { color: colors.highlight } : undefined}
      style={({ pressed }) => [
        style,
        pressed && isIOS && { opacity: 0.6 },
        disabled && { opacity: 0.4 },
      ]}
    >
      {children}
    </Pressable>
  );
}

// ---------- Layout ----------

/** Page wrapper: grouped background + comfortable content insets. */
export function Screen({
  children,
  scroll = true,
  style,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  if (!scroll) {
    return <View style={[styles.screen, style]}>{children}</View>;
  }
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[{ padding: spacing.lg, paddingBottom: spacing.xxl }, style]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Hairline rule, inset on iOS so it lines up with row text. */
export function Divider({ inset = true }: { inset?: boolean }) {
  return <View style={[styles.divider, inset && { marginLeft: separatorInset }]} />;
}

// ---------- Grouped list ----------

/**
 * Grouped list container. On iOS this is the rounded inset card with an
 * uppercase header that makes an app read as native; on Android it is a
 * flat full-width block with a tinted header.
 */
export function ListSection({
  title,
  footer,
  children,
  style,
}: {
  title?: string;
  footer?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ marginBottom: spacing.xl }, style]}>
      {title ? <Text style={styles.sectionHeader}>{isIOS ? title.toUpperCase() : title}</Text> : null}
      <View style={styles.sectionBody}>
        {rows.map((row, i) => (
          <React.Fragment key={i}>
            {row}
            {i < rows.length - 1 && <Divider />}
          </React.Fragment>
        ))}
      </View>
      {footer ? <Text style={styles.sectionFooter}>{footer}</Text> : null}
    </View>
  );
}

/** A single row inside a ListSection. */
export function ListRow({
  label,
  sublabel,
  value,
  icon,
  onPress,
  chevron,
  destructive,
  right,
}: {
  label: string;
  sublabel?: string;
  value?: string;
  icon?: string;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  right?: React.ReactNode;
}) {
  const showChevron = chevron ?? !!onPress;
  return (
    <Touchable onPress={onPress} style={styles.row}>
      {icon ? <Text style={styles.rowIcon}>{icon}</Text> : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, destructive && { color: colors.danger }]} numberOfLines={1}>
          {label}
        </Text>
        {sublabel ? (
          <Text style={styles.rowSublabel} numberOfLines={2}>
            {sublabel}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {right}
      {showChevron ? <Text style={styles.chevron}>›</Text> : null}
    </Touchable>
  );
}

// ---------- Controls ----------

export function Button({
  title,
  onPress,
  loading,
  variant = 'primary',
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  /** `outline` and `danger` predate this redesign and still behave the same. */
  variant?: 'primary' | 'outline' | 'danger' | 'tinted' | 'plain';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fill: ViewStyle =
    variant === 'primary'
      ? { backgroundColor: colors.primary }
      : variant === 'danger'
        ? { backgroundColor: colors.danger }
        : variant === 'tinted'
          ? { backgroundColor: colors.fill }
          : variant === 'outline'
            ? { backgroundColor: 'transparent', borderWidth: hairline, borderColor: colors.primary }
            : { backgroundColor: 'transparent' };

  // Filled variants carry white text; the rest tint their label with the brand.
  const label =
    variant === 'primary' || variant === 'danger' ? colors.white : colors.primary;

  return (
    <Touchable onPress={onPress} disabled={disabled || loading} style={[styles.btn, fill, style]}>
      {loading ? (
        <ActivityIndicator color={label} />
      ) : (
        <Text style={[type.button, { color: label }]}>{title}</Text>
      )}
    </Touchable>
  );
}

export function Field(
  props: TextInputProps & {
    label: string;
    hint?: string;
    /** Styles the wrapper. `style` still targets the TextInput itself. */
    containerStyle?: StyleProp<ViewStyle>;
  },
) {
  const { label, hint, containerStyle, style, ...rest } = props;
  return (
    <View style={[{ marginBottom: spacing.lg }, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      {/* style is merged, not spread, so callers can tweak without losing the base look. */}
      <TextInput placeholderTextColor={colors.icon} {...rest} style={[styles.input, style]} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** iOS-style segmented control; on Android it reads as a Material tab strip. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.segment, style]}>
      {options.map(([key, label]) => {
        const active = key === value;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
          >
            <Text
              style={[
                type.footnote,
                { fontWeight: active ? '600' : '400', color: active ? colors.text : colors.muted },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function YesNoPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: 'yes' | 'no' | null;
  onChange: (v: 'yes' | 'no') => void;
}) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.label}>{label}</Text>
      <SegmentedControl
        options={[
          ['yes', 'Yes'],
          ['no', 'No'],
        ] as const}
        value={(value ?? '') as 'yes' | 'no'}
        onChange={onChange}
      />
    </View>
  );
}

// ---------- Display ----------

export function StatusBadge({ status }: { status: string }) {
  const tint = statusColors[status] ?? colors.icon;
  return (
    <View style={[styles.badge, { backgroundColor: tint + '1F' }]}>
      <Text style={[styles.badgeText, { color: tint }]}>{status.replace(/_/g, ' ')}</Text>
    </View>
  );
}

/** Initials circle — avoids shipping placeholder images. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={{ color: colors.primary, fontWeight: '600', fontSize: size * 0.36 }}>
        {initials}
      </Text>
    </View>
  );
}

export function Empty({ text, icon }: { text: string; icon?: string }) {
  return (
    <View style={styles.empty}>
      {icon ? <Text style={{ fontSize: 40, marginBottom: spacing.md }}>{icon}</Text> : null}
      <Text style={[type.subhead, { color: colors.muted, textAlign: 'center' }]}>{text}</Text>
    </View>
  );
}

// ---------- Styles ----------

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.groupedBg },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow(1),
  },

  divider: { height: hairline, backgroundColor: colors.separator },

  sectionHeader: {
    ...type.footnote,
    color: colors.muted,
    marginBottom: spacing.sm,
    marginLeft: isIOS ? spacing.lg : 0,
    letterSpacing: isIOS ? 0.6 : 0.1,
    fontWeight: isIOS ? '500' : '600',
  },
  sectionBody: {
    backgroundColor: colors.rowBg,
    borderRadius: radius.card,
    overflow: 'hidden',
    ...shadow(1),
  },
  sectionFooter: {
    ...type.caption,
    color: colors.muted,
    marginTop: spacing.sm,
    marginLeft: isIOS ? spacing.lg : 0,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.rowBg,
  },
  rowIcon: { fontSize: 20, width: 26, textAlign: 'center' },
  rowLabel: { ...type.body, color: colors.text },
  rowSublabel: { ...type.footnote, color: colors.muted, marginTop: 2 },
  rowValue: { ...type.body, color: colors.muted, maxWidth: '45%' },
  chevron: { fontSize: 22, color: colors.icon, marginLeft: -4, opacity: 0.5 },

  btn: {
    minHeight: touchTarget,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xs,
  },

  label: {
    ...type.footnote,
    color: colors.muted,
    marginBottom: spacing.xs,
    fontWeight: '500',
  },
  input: {
    ...type.body,
    borderWidth: hairline,
    borderColor: colors.separator,
    borderRadius: radius.field,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: touchTarget,
    backgroundColor: colors.card,
    color: colors.text,
  },
  hint: { ...type.caption, color: colors.muted, marginTop: spacing.xs },

  segment: {
    flexDirection: 'row',
    backgroundColor: colors.fill,
    borderRadius: radius.field,
    padding: 2,
    gap: 2,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.field - 2,
    minHeight: 32,
  },
  segmentItemActive: {
    backgroundColor: colors.white,
    ...shadow(isIOS ? 1 : 0),
  },

  badge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeText: {
    ...type.caption,
    fontWeight: '600',
    textTransform: 'capitalize',
  },

  avatar: {
    backgroundColor: colors.primary + '1A',
    alignItems: 'center',
    justifyContent: 'center',
  },

  empty: { padding: spacing.xxl, alignItems: 'center' },
});
