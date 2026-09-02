import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../format.dart';
import '../network/api_exception.dart';
import '../theme/app_theme.dart';

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

/// The one panel primitive the whole app is built out of: a white plane that
/// floats on the paper ground on a soft two-layer shadow.
///
/// It replaces the old `Card` + hairline-border pattern. A border *and* a
/// shadow read as two competing edges; picking the shadow alone is what lets a
/// screen stack four panels without looking like a spreadsheet. Pass
/// [onTap] and the whole surface becomes a press target that dips under the
/// finger.
class AppSurface extends StatelessWidget {
  const AppSurface({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.radius = AppRadius.lg,
    this.color = AppColors.card,
    this.onTap,
    this.shadows = AppShadows.card,
    this.border,
    this.clip = false,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final double radius;
  final Color color;
  final VoidCallback? onTap;
  final List<BoxShadow> shadows;
  final BoxBorder? border;

  /// Clip children to the rounded corners — needed whenever the surface holds
  /// full-bleed rows (an ink splash would otherwise square off the corners).
  final bool clip;

  @override
  Widget build(BuildContext context) {
    final borderRadius = BorderRadius.circular(radius);

    Widget content = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color,
        borderRadius: borderRadius,
        border: border,
        boxShadow: shadows,
      ),
      clipBehavior: clip ? Clip.antiAlias : Clip.none,
      child: child,
    );

    if (onTap != null) {
      content = AppPressable(onTap: onTap, borderRadius: borderRadius, child: content);
    }

    return margin != null ? Padding(padding: margin!, child: content) : content;
  }
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

/// The app bar every screen uses instead of the stock Material one.
///
/// Three deliberate departures from the default: the bar is transparent so the
/// paper ground runs unbroken from status bar to tab bar (no chrome band, no
/// scrolled-under seam); the title is display-weight rather than the 20px
/// medium Material picks; and back/actions are circular tinted buttons with a
/// real 44px target instead of bare glyphs floating in the corner.
///
/// Purely presentational — the leading button calls `Navigator.maybePop`, which
/// is exactly what the default `AppBar` back button does.
class AppTopBar extends StatelessWidget implements PreferredSizeWidget {
  const AppTopBar({
    super.key,
    required this.title,
    this.subtitle,
    this.actions = const [],
    this.leading,
    this.bottom,
    this.showBack = true,
    this.centerTitle = false,
    this.backgroundColor,
  });

  final String title;

  /// A quiet second line under the title — the record a detail screen is
  /// about, the section a register belongs to. Keeps context on screen without
  /// spending it on the headline.
  final String? subtitle;
  final List<Widget> actions;
  final Widget? leading;

  /// A search field, filter row or tab bar pinned under the title.
  final PreferredSizeWidget? bottom;
  final bool showBack;
  final bool centerTitle;
  final Color? backgroundColor;

  static const double _base = 64;
  static const double _withSubtitle = 74;

  @override
  Size get preferredSize => Size.fromHeight(
        (subtitle == null ? _base : _withSubtitle) + (bottom?.preferredSize.height ?? 0),
      );

  @override
  Widget build(BuildContext context) {
    final canPop = Navigator.of(context).canPop();
    final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
    // The bar is the one piece of chrome with a fixed height, so it has to
    // grow with the text-size setting rather than clip the title.
    final height = ((subtitle == null ? _base : _withSubtitle) * (1 + (scale - 1) * 0.45))
        .clamp(subtitle == null ? _base : _withSubtitle, 108.0);

    return AppBar(
      backgroundColor: backgroundColor ?? Colors.transparent,
      toolbarHeight: height,
      leadingWidth: leading != null || (showBack && canPop) ? 60 : 0,
      automaticallyImplyLeading: false,
      titleSpacing: leading != null || (showBack && canPop) ? 0 : AppSpacing.page,
      centerTitle: centerTitle,
      leading: leading ??
          (showBack && canPop
              ? Padding(
                  padding: const EdgeInsets.only(left: AppSpacing.lg),
                  child: AppIconButton(
                    icon: Icons.arrow_back_rounded,
                    tooltip: MaterialLocalizations.of(context).backButtonTooltip,
                    onPressed: () => Navigator.maybePop(context),
                  ),
                )
              : null),
      title: Column(
        crossAxisAlignment: centerTitle ? CrossAxisAlignment.center : CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).appBarTheme.titleTextStyle,
          ),
          if (subtitle != null)
            Padding(
              padding: const EdgeInsets.only(top: 1),
              child: Text(
                subtitle!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: AppColors.ink3,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 0,
                ),
              ),
            ),
        ],
      ),
      actions: [
        ...actions,
        const SizedBox(width: AppSpacing.lg),
      ],
      bottom: bottom,
    );
  }
}

/// A circular icon button with a real touch target and an optional unread
/// count. The app's only icon-button style — app bar actions, the
/// notification bell and inline row actions all resolve to this, so a tap
/// target is never smaller in one place than another.
class AppIconButton extends StatelessWidget {
  const AppIconButton({
    super.key,
    required this.icon,
    required this.onPressed,
    this.tooltip,
    this.tone,
    this.filled = true,
    this.badgeCount,
    this.size = 42,
    this.iconSize = 20,
  });

  final IconData icon;
  final VoidCallback? onPressed;
  final String? tooltip;

  /// Tints the glyph and, when [filled], the disc behind it.
  final Tone? tone;

  /// A tinted disc behind the glyph. Off for buttons that sit on an already
  /// tinted surface, where a second fill would muddy it.
  final bool filled;
  final int? badgeCount;
  final double size;
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    final foreground = tone != null ? toneColor(tone!) : AppColors.ink2;
    final background = tone != null ? toneBackground(tone!) : AppColors.paper2;

    Widget glyph = Icon(icon, size: iconSize, color: onPressed == null ? AppColors.ink3 : foreground);

    if (badgeCount != null && badgeCount! > 0) {
      glyph = Badge(
        label: Text(badgeCount! > 9 ? '9+' : '$badgeCount'),
        backgroundColor: AppColors.brand,
        textColor: Colors.white,
        offset: const Offset(6, -6),
        padding: const EdgeInsets.symmetric(horizontal: 5),
        textStyle: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, height: 1.2),
        child: glyph,
      );
    }

    // A small rounded square, not a circle — matches the squared-corner
    // language every other medallion and button in the app uses; a lone
    // circular action button was the one round outlier.
    final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.sm));

    final button = Semantics(
      button: true,
      label: tooltip,
      child: SizedBox(
        width: size,
        height: size,
        child: Material(
          color: filled ? background : Colors.transparent,
          shape: shape,
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onPressed,
            child: Center(child: glyph),
          ),
        ),
      ),
    );

    return tooltip != null ? Tooltip(message: tooltip!, child: button) : button;
  }
}

/// The primary action button as a floating pill: brand fill, green-tinted
/// shadow rather than the grey Material draws, and a press dip.
///
/// Replaces the stock `FloatingActionButton` at every call site. Same
/// contract — an icon, an optional label, one callback.
class AppFab extends StatelessWidget {
  const AppFab({super.key, required this.icon, required this.onPressed, this.label, this.tooltip});

  final IconData icon;
  final VoidCallback onPressed;
  final String? label;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final extended = label != null;
    // Squared, not a pill — the FAB was deliberately squared-off in this
    // app's original design (to match the cards/buttons rather than
    // Material 3's default pill), and that holds whether or not it carries
    // a label.
    final radius = BorderRadius.circular(AppRadius.lg);

    return Tooltip(
      message: tooltip ?? label ?? '',
      child: AppPressable(
        onTap: onPressed,
        borderRadius: radius,
        scale: 0.94,
        // Sized by padding alone (child size + padding), not by a
        // Container(alignment:) — that combination expands to fill whatever
        // bounded width its parent offers (here, the Scaffold's floating
        // action button slot), which is what stretched this into a
        // full-width bar. Padding has no such ambiguity: 17 on every side of
        // a 22px icon is exactly a 56x56 square, deterministically.
        child: Ink(
          decoration: BoxDecoration(
            color: AppColors.brand,
            borderRadius: radius,
            boxShadow: AppShadows.brand,
          ),
          child: Padding(
            padding: extended
                ? const EdgeInsets.symmetric(horizontal: AppSpacing.ml, vertical: 17)
                : const EdgeInsets.all(17),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, color: Colors.white, size: 22),
                if (extended) ...[
                  const SizedBox(width: AppSpacing.sm + 2),
                  Text(
                    label!,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                      letterSpacing: -0.1,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Form sheets
// ---------------------------------------------------------------------------

/// Presents a form as a near-full-screen sheet instead of a centred dialog.
///
/// Every "add a thing" flow in the app used to open an `AlertDialog`: on a
/// phone that is a ~300px-tall box holding four text fields, a dropdown and
/// two buttons, with the keyboard covering half of it. A sheet gets the whole
/// screen, keeps the submit button pinned in reach, and resizes around the
/// keyboard instead of hiding behind it.
///
/// Returns exactly what `showDialog` did — whatever the form pops, or null if
/// it is dismissed — so call sites keep their existing result handling.
Future<T?> showAppFormSheet<T>(BuildContext context, {required WidgetBuilder builder}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.card,
    // A form is a commitment; dismissing it should be a deliberate tap on
    // Cancel or the close button, not a stray swipe over a filled-in field.
    isDismissible: false,
    enableDrag: false,
    builder: builder,
  );
}

/// The chrome inside a [showAppFormSheet]: a title bar with a close button, a
/// scrolling body, and a pinned action row at the foot.
class AppFormSheet extends StatelessWidget {
  const AppFormSheet({
    super.key,
    required this.title,
    required this.child,
    this.subtitle,
    this.actions = const [],
  });

  final String title;
  final String? subtitle;
  final Widget child;

  /// The action row at the foot — typically a Cancel and a primary button.
  /// Laid out as equal-width columns so the primary lands under the thumb.
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    // Measure against what is left after the status bar and the keyboard, so
    // a raised keyboard shrinks the sheet rather than pushing its foot off
    // the bottom of the screen.
    final available = media.size.height - media.padding.top - media.viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: media.viewInsets.bottom),
      child: SizedBox(
        height: (available * 0.94).clamp(320.0, media.size.height),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.lg, AppSpacing.md, AppSpacing.lg),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.5,
                            height: 1.2,
                          ),
                        ),
                        if (subtitle != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(
                              subtitle!,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: AppColors.ink3, fontSize: 12.5),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  AppIconButton(
                    icon: Icons.close_rounded,
                    tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: SingleChildScrollView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.page,
                  AppSpacing.ml,
                  AppSpacing.page,
                  AppSpacing.ml,
                ),
                child: child,
              ),
            ),
            if (actions.isNotEmpty)
              DecoratedBox(
                decoration: const BoxDecoration(
                  color: AppColors.card,
                  boxShadow: AppShadows.raised,
                ),
                child: SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.page,
                      AppSpacing.md,
                      AppSpacing.page,
                      AppSpacing.md,
                    ),
                    child: Row(
                      children: [
                        for (var i = 0; i < actions.length; i++) ...[
                          if (i > 0) const SizedBox(width: AppSpacing.md),
                          Expanded(child: actions[i]),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Labels, headers, badges
// ---------------------------------------------------------------------------

/// The web app's ".eyebrow" utility: small-caps micro label. Now used only
/// where a label has to sit *above* a figure it belongs to (stat blocks, hero
/// kickers) — section titles moved up to [SectionHeader]'s heavier treatment.
class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key, this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: TextStyle(
        fontSize: 10.5,
        fontWeight: FontWeight.w800,
        letterSpacing: 1.0,
        height: 1.3,
        color: color ?? AppColors.ink3,
      ),
    );
  }
}

/// A section title with an optional trailing action.
///
/// Promoted from a faint 11px all-caps eyebrow to a real 16px heading: the old
/// treatment made every section label quieter than the body text underneath
/// it, which inverted the hierarchy on any screen with more than two groups.
/// A brand tick to the left of the title marks where a group starts without
/// needing a rule across the screen.
class SectionHeader extends StatelessWidget {
  const SectionHeader(
    this.title, {
    super.key,
    this.actionLabel,
    this.onAction,
    this.trailing,
    this.padding = EdgeInsets.zero,
    this.count,
  });

  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;

  /// An arbitrary trailing widget, when the action isn't a plain text button.
  final Widget? trailing;
  final EdgeInsetsGeometry padding;

  /// A count pill after the title — "Students 128". Cheap way to answer "how
  /// many" without a second line of chrome.
  final int? count;

  @override
  Widget build(BuildContext context) {
    final action = trailing ??
        (actionLabel != null && onAction != null
            ? TextButton(
                onPressed: onAction,
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
                  minimumSize: const Size(0, 32),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  visualDensity: VisualDensity.compact,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Flexible(child: Text(actionLabel!, maxLines: 1, overflow: TextOverflow.ellipsis)),
                    const Icon(Icons.chevron_right_rounded, size: 17),
                  ],
                ),
              )
            : null);

    return Padding(
      padding: padding,
      child: ConstrainedBox(
        // A floor rather than a fixed height: the gap below a header stays
        // identical whether or not it has an action, but a header still grows
        // instead of clipping at large accessibility text sizes.
        constraints: const BoxConstraints(minHeight: 40),
        child: Row(
          children: [
            Container(
              width: 3,
              height: 15,
              margin: const EdgeInsets.only(right: AppSpacing.sm + 2),
              decoration: BoxDecoration(
                color: AppColors.brand,
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
            ),
            Flexible(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.35,
                  color: AppColors.ink,
                  height: 1.2,
                ),
              ),
            ),
            if (count != null) ...[
              const SizedBox(width: AppSpacing.sm),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.paper2,
                  borderRadius: BorderRadius.circular(AppRadius.pill),
                ),
                child: Text(
                  '$count',
                  style: const TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink3,
                    height: 1.3,
                  ),
                ),
              ),
            ],
            const Spacer(),
            if (action != null) ...[const SizedBox(width: AppSpacing.sm), action],
          ],
        ),
      ),
    );
  }
}

/// A colored status pill — mirrors the web's Badge component with a `tone`
/// prop. Now carries a tone-coloured dot when it has no icon, so a row of
/// badges is scannable by colour position rather than by reading each label.
class ToneBadge extends StatelessWidget {
  const ToneBadge(this.label, {super.key, this.tone = Tone.neutral, this.icon, this.dot = true});

  final String label;
  final Tone tone;
  final IconData? icon;

  /// Show the leading dot when there's no icon. Off for dense contexts where
  /// several badges sit inside one row of a table-like list.
  final bool dot;

  @override
  Widget build(BuildContext context) {
    final color = toneColor(tone);
    final showDot = dot && icon == null;

    return Container(
      padding: EdgeInsets.fromLTRB(icon != null ? 8 : (showDot ? 8 : 10), 4.5, 10, 4.5),
      decoration: BoxDecoration(
        color: toneBackground(tone),
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: color),
            const SizedBox(width: 5),
          ] else if (showDot) ...[
            Container(
              width: 6,
              height: 6,
              margin: const EdgeInsets.only(right: 6),
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
          ],
          Text(
            label,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              color: toneInk(tone),
              height: 1.25,
              letterSpacing: 0.1,
            ),
          ),
        ],
      ),
    );
  }
}

/// A standalone at-a-glance chip (attendance summary, "3 sections to mark").
/// Larger and softer than [ToneBadge]: these are read one at a time from a
/// dashboard, not scanned down a list column.
class AppStatChip extends StatelessWidget {
  const AppStatChip({super.key, required this.label, required this.tone, this.icon, this.onTap});

  final String label;
  final Tone tone;
  final IconData? icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final color = toneColor(tone);
    final radius = BorderRadius.circular(AppRadius.pill);

    final chip = Container(
      padding: EdgeInsets.fromLTRB(icon == null ? 14 : 10, 9, 14, 9),
      decoration: BoxDecoration(color: toneBackground(tone), borderRadius: radius),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 15, color: color),
            const SizedBox(width: 7),
          ],
          Flexible(
            child: Text(
              label,
              style: TextStyle(
                color: toneInk(tone),
                fontWeight: FontWeight.w700,
                fontSize: 13,
                height: 1.2,
                letterSpacing: -0.1,
              ),
            ),
          ),
        ],
      ),
    );

    return onTap != null ? AppPressable(onTap: onTap, borderRadius: radius, child: chip) : chip;
  }
}

/// Initials in a disc — the identity marker for a person anywhere they appear
/// in a list (children on Home, chat threads, the staff directory, the profile
/// header). Derives up to two initials so two students in the same class don't
/// both show as "A".
class AppAvatar extends StatelessWidget {
  const AppAvatar({
    super.key,
    required this.name,
    this.size = 44,
    this.tone = Tone.brand,
    this.filled = false,
  });

  final String name;
  final double size;
  final Tone tone;

  /// Solid tone fill with white initials, for the one avatar that is the
  /// subject of a screen rather than a row in a list.
  final bool filled;

  static String initialsOf(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.characters.first.toUpperCase();
    return (parts.first.characters.first + parts.last.characters.first).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: filled ? toneColor(tone) : toneBackground(tone),
        shape: BoxShape.circle,
        border: filled ? Border.all(color: Colors.white.withValues(alpha: 0.45), width: 2) : null,
      ),
      child: Text(
        initialsOf(name),
        style: TextStyle(
          color: filled ? Colors.white : toneInk(tone),
          fontWeight: FontWeight.w800,
          fontSize: size * 0.36,
          letterSpacing: -0.2,
          height: 1,
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

/// Wraps a tap target so it dips slightly while held. Material's ink ripple
/// alone reads as flat on the large card-shaped targets this app uses; a few
/// pixels of scale is what makes them feel like physical buttons. Deliberately
/// subtle and fast — this should register as responsiveness, not as an
/// animation the user has to wait through.
class AppPressable extends StatefulWidget {
  const AppPressable({
    super.key,
    required this.child,
    required this.onTap,
    this.borderRadius,
    this.scale = 0.975,
    this.onLongPress,
  });

  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final BorderRadius? borderRadius;
  final double scale;

  @override
  State<AppPressable> createState() => _AppPressableState();
}

class _AppPressableState extends State<AppPressable> {
  bool _down = false;

  void _set(bool value) {
    if (widget.onTap == null || _down == value) return;
    setState(() => _down = value);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => _set(true),
      onTapUp: (_) => _set(false),
      onTapCancel: () => _set(false),
      child: AnimatedScale(
        scale: _down ? widget.scale : 1,
        duration: AppMotion.fast,
        curve: AppMotion.curve,
        child: Material(
          color: Colors.transparent,
          borderRadius: widget.borderRadius,
          child: InkWell(
            borderRadius: widget.borderRadius,
            onTap: widget.onTap,
            onLongPress: widget.onLongPress,
            child: widget.child,
          ),
        ),
      ),
    );
  }
}

/// A short fade-and-rise used when fetched content first replaces its loading
/// placeholder, so data arrives rather than snapping into place. One-shot and
/// cheap. Pass a per-index [delay] to stagger a list into view.
class AppFadeIn extends StatefulWidget {
  const AppFadeIn({super.key, required this.child, this.delay = Duration.zero});

  final Widget child;
  final Duration delay;

  /// The stagger step for list items — 8 rows in, the delay stops growing so a
  /// long list never makes the user wait for the bottom of it.
  static Duration stagger(int index) => Duration(milliseconds: 45 * (index.clamp(0, 8)));

  @override
  State<AppFadeIn> createState() => _AppFadeInState();
}

class _AppFadeInState extends State<AppFadeIn> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: AppMotion.base,
  );
  late final Animation<double> _curve = CurvedAnimation(parent: _controller, curve: AppMotion.curve);

  @override
  void initState() {
    super.initState();
    if (widget.delay == Duration.zero) {
      _controller.forward();
    } else {
      Future.delayed(widget.delay, () {
        if (mounted) _controller.forward();
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _curve,
      child: SlideTransition(
        position: Tween(begin: const Offset(0, 0.035), end: Offset.zero).animate(_curve),
        child: widget.child,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Cards, tiles, rows
// ---------------------------------------------------------------------------

/// A tappable quick-launch tile — icon medallion, label, and a corner arrow
/// that tells you it goes somewhere.
///
/// The tone tint now washes the whole tile faintly rather than being confined
/// to the icon chip, which is what turns a grid of these from four identical
/// white boxes into four distinguishable destinations.
class AppActionCard extends StatelessWidget {
  const AppActionCard({
    super.key,
    required this.icon,
    required this.label,
    required this.tone,
    required this.onTap,
    this.badge,
  });

  final IconData icon;
  final String label;
  final Tone tone;
  final VoidCallback onTap;

  /// An optional count in the corner in place of the arrow — unread items,
  /// sections still to mark.
  final int? badge;

  @override
  Widget build(BuildContext context) {
    final color = toneColor(tone);
    final radius = BorderRadius.circular(AppRadius.lg);

    return AppPressable(
      onTap: onTap,
      borderRadius: radius,
      child: Ink(
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: radius,
          boxShadow: AppShadows.card,
        ),
        child: Stack(
          children: [
            // A faint corner wash in the tile's tone — enough to tell four
            // tiles apart at a glance, not enough to compete with the label.
            Positioned(
              right: -34,
              top: -34,
              child: Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(
                  color: toneBackground(tone).withValues(alpha: 0.45),
                  shape: BoxShape.circle,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // A light tinted plate with a line-weight glyph, not a
                      // solid slab of brand colour: at four-to-a-screen the
                      // filled version turned the grid into a block of paint
                      // and buried the labels under it.
                      Container(
                        width: 40,
                        height: 40,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: toneBackground(tone),
                          borderRadius: BorderRadius.circular(AppRadius.sm),
                        ),
                        child: Icon(icon, color: color, size: 21),
                      ),
                      const Spacer(),
                      if (badge != null && badge! > 0)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                          decoration: BoxDecoration(
                            color: color,
                            borderRadius: BorderRadius.circular(AppRadius.pill),
                          ),
                          child: Text(
                            '$badge',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              height: 1.4,
                            ),
                          ),
                        )
                      else
                        const Icon(Icons.north_east_rounded, size: 15, color: AppColors.ink3),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  // Flexible + ellipsis: at large text scales a two-word label
                  // would otherwise overflow this fixed-height grid cell.
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 14.5,
                        height: 1.2,
                        letterSpacing: -0.25,
                        color: AppColors.ink,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One row in an [AppTileGroup] — medallion, label, optional subtitle,
/// chevron.
///
/// Rebuilt off `ListTile` onto a plain `Row`: `ListTile` fixes its own
/// vertical metrics and left the medallion optically high against a
/// two-line row, and there was no way to give the chevron the muted disc it
/// needed without fighting its trailing slot.
class AppTile extends StatelessWidget {
  const AppTile({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.isLast = false,
    this.subtitle,
    this.trailing,
    this.tone,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool isLast;
  final String? subtitle;
  final Widget? trailing;

  /// Tints the leading icon medallion — used sparingly, for rows that carry a
  /// status (e.g. a destructive "Sign out") rather than for decoration.
  final Tone? tone;

  /// Left inset of the divider between rows: page gutter + medallion + gap, so
  /// the rule starts under the text rather than under the icons.
  static const dividerIndent = 16.0 + 40 + 14;

  @override
  Widget build(BuildContext context) {
    final iconColor = tone != null ? toneColor(tone!) : AppColors.ink2;
    final iconBackground = tone != null ? toneBackground(tone!) : AppColors.paper2;

    return Column(
      children: [
        AppPressable(
          onTap: onTap,
          scale: 0.99,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: 14),
            child: Row(
              children: [
                // A tinted rounded medallion instead of a bare glyph: it gives
                // every row a consistent optical left edge regardless of how
                // wide or narrow the individual icon happens to be.
                Container(
                  width: 40,
                  height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: iconBackground,
                    borderRadius: BorderRadius.circular(AppRadius.sm),
                  ),
                  child: Icon(icon, color: iconColor, size: 20),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        label,
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 15,
                          letterSpacing: -0.2,
                          height: 1.3,
                          color: tone == Tone.bad ? AppColors.overdue : AppColors.ink,
                        ),
                      ),
                      if (subtitle != null && subtitle!.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            subtitle!,
                            style: const TextStyle(color: AppColors.ink3, fontSize: 12.5, height: 1.35),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                trailing ?? const Icon(Icons.chevron_right_rounded, color: AppColors.line2, size: 22),
              ],
            ),
          ),
        ),
        if (!isLast)
          const Divider(height: 1, indent: dividerIndent, endIndent: AppSpacing.lg),
      ],
    );
  }
}

/// The icon/label/onTap for one [AppTile], as a plain value so a role-gated
/// tile list can be built up as a `List<AppTileSpec>` before it's known which
/// entry will end up last.
class AppTileSpec {
  const AppTileSpec(this.icon, this.label, this.onTap, {this.subtitle, this.tone, this.trailing});

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final String? subtitle;
  final Tone? tone;

  /// Overrides the default chevron — pass `SizedBox.shrink()` for a row that
  /// performs an action in place rather than navigating somewhere.
  final Widget? trailing;
}

/// A grouped panel of [AppTile]s with a divider between (never after) each one
/// — safe to feed a role-conditional list without hand-tracking which tile
/// happens to be last for a given role combination.
class AppTileGroup extends StatelessWidget {
  const AppTileGroup({super.key, required this.tiles});

  final List<AppTileSpec> tiles;

  @override
  Widget build(BuildContext context) {
    return AppSurface(
      clip: true,
      child: Column(
        children: [
          for (var i = 0; i < tiles.length; i++)
            AppTile(
              icon: tiles[i].icon,
              label: tiles[i].label,
              onTap: tiles[i].onTap,
              subtitle: tiles[i].subtitle,
              tone: tiles[i].tone,
              trailing: tiles[i].trailing,
              isLast: i == tiles.length - 1,
            ),
        ],
      ),
    );
  }
}

/// A general-purpose list row: optional leading medallion, a title, a quiet
/// second line, and a trailing slot.
///
/// This is what the app's ~40 hand-configured `ListTile`s collapsed into.
/// `ListTile` fixes its own vertical metrics and its own leading/trailing
/// insets, so every screen that wanted a different medallion size or a badge
/// on the right ended up overriding three properties and still landing a few
/// pixels off its neighbours. This owns those metrics once.
class AppListRow extends StatelessWidget {
  const AppListRow({
    super.key,
    required this.title,
    this.subtitle,
    this.icon,
    this.tone,
    this.leading,
    this.trailing,
    this.onTap,
    this.titleWidget,
    this.showChevron = false,
  });

  final String title;
  final String? subtitle;

  /// Renders in a tinted medallion at the leading edge. Ignored when
  /// [leading] is supplied.
  final IconData? icon;
  final Tone? tone;

  /// An arbitrary leading widget — an avatar, a date block, a checkbox.
  final Widget? leading;
  final Widget? trailing;
  final VoidCallback? onTap;

  /// Replaces the plain title text when the title needs its own composition
  /// (a name with an inline role, a figure with a unit).
  final Widget? titleWidget;

  /// Adds the navigation chevron after [trailing]. Off by default: a chevron
  /// on a row that doesn't push a screen is a lie.
  final bool showChevron;

  @override
  Widget build(BuildContext context) {
    final effectiveTone = tone ?? Tone.neutral;

    final leadingWidget = leading ??
        (icon != null
            ? Container(
                width: 40,
                height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: toneBackground(effectiveTone),
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                ),
                child: Icon(
                  icon,
                  size: 20,
                  color: tone != null ? toneColor(effectiveTone) : AppColors.ink2,
                ),
              )
            : null);

    final row = Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: 14),
      child: Row(
        children: [
          if (leadingWidget != null) ...[leadingWidget, const SizedBox(width: 14)],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                titleWidget ??
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                        height: 1.3,
                        letterSpacing: -0.2,
                      ),
                    ),
                if (subtitle != null && subtitle!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      subtitle!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: AppColors.ink3, fontSize: 12.5, height: 1.35),
                    ),
                  ),
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: AppSpacing.md), trailing!],
          if (showChevron) ...[
            const SizedBox(width: AppSpacing.xs),
            const Icon(Icons.chevron_right_rounded, color: AppColors.line2, size: 22),
          ],
        ],
      ),
    );

    return onTap != null ? AppPressable(onTap: onTap, scale: 0.99, child: row) : row;
  }
}

/// A label/value pair — the unit every detail screen is made of.
///
/// The value is right-aligned against a left-aligned label with a dotted
/// leader's worth of space between: it lets a column of these be read down
/// the right edge as a list of answers, which is how people actually scan a
/// record.
class AppKeyValue extends StatelessWidget {
  const AppKeyValue({super.key, required this.label, required this.value, this.tone, this.valueWidget});

  final String label;
  final String value;
  final Tone? tone;

  /// Renders in place of the value text — a badge, a chip row, a link.
  final Widget? valueWidget;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // A flex ratio rather than a fixed label column: at large text
          // scales a fixed width clips longer labels ("Guardian phone")
          // mid-word.
          Expanded(
            flex: 4,
            child: Text(
              label,
              style: const TextStyle(color: AppColors.ink3, fontSize: 13, height: 1.45, fontWeight: FontWeight.w500),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            flex: 6,
            child: valueWidget != null
                ? Align(alignment: Alignment.centerRight, child: valueWidget)
                : Text(
                    value,
                    textAlign: TextAlign.right,
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                      height: 1.45,
                      letterSpacing: -0.1,
                      color: tone != null ? toneColor(tone!) : AppColors.ink,
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

/// A run of [AppKeyValue] rows in one panel, hairline-separated.
class AppKeyValueGroup extends StatelessWidget {
  const AppKeyValueGroup({super.key, required this.rows});

  final List<AppKeyValue> rows;

  @override
  Widget build(BuildContext context) {
    return AppSurface(
      clip: true,
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            rows[i],
            if (i < rows.length - 1)
              const Divider(height: 1, indent: AppSpacing.lg, endIndent: AppSpacing.lg),
          ],
        ],
      ),
    );
  }
}

/// Groups a run of form fields (or any content) into one [AppSurface] panel
/// under a [SectionHeader] — the unit a form should be built from instead of
/// a flat `ListView` of fields with nothing marking where one group of
/// questions ends and the next begins.
class AppFormSection extends StatelessWidget {
  const AppFormSection({super.key, required this.title, required this.children, this.trailing});

  final String title;
  final List<Widget> children;

  /// An arbitrary trailing widget on the header — a count, a helper note.
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return AppSurface(
      padding: const EdgeInsets.all(AppSpacing.ml),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionHeader(title, trailing: trailing),
          const SizedBox(height: AppSpacing.sm),
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) const SizedBox(height: AppSpacing.md),
            children[i],
          ],
        ],
      ),
    );
  }
}

/// One label/value column inside an [AppSummaryCard] row.
class AppStat {
  const AppStat({required this.label, required this.value, this.tone});

  final String label;
  final String value;

  /// Colours the value — for figures that carry a verdict (an outstanding
  /// balance, an overdue count) rather than neutral counts.
  final Tone? tone;
}

/// A row of at-a-glance figures — the numbers a screen opens with.
///
/// Restructured from a bordered card of same-size text into a proper metric
/// band: micro-label above, display-weight figure below, a tone dot marking
/// the ones that carry a verdict. The figure is now the largest thing on the
/// panel, which is the whole point of a summary.
class AppSummaryCard extends StatelessWidget {
  const AppSummaryCard({
    super.key,
    required this.stats,
    this.margin = const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.sm),
  });

  final List<AppStat> stats;
  final EdgeInsetsGeometry margin;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: margin,
      child: AppSurface(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.ml, vertical: AppSpacing.lg + 2),
        // Stretching a Row's children to a shared height only has a height to
        // stretch to once one is known — inside a sliver's unbounded-height
        // adapter (every screen that puts this card in a scroll view), the
        // Row would otherwise be asked to fill infinite height and crash.
        // IntrinsicHeight measures the tallest child first, then hands the
        // Row that fixed number instead of the incoming infinity.
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = 0; i < stats.length; i++) ...[
                if (i > 0)
                  Container(
                    width: 1,
                    margin: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                    color: AppColors.line.withValues(alpha: 0.7),
                  ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          if (stats[i].tone != null)
                            Container(
                              width: 6,
                              height: 6,
                              margin: const EdgeInsets.only(right: 6),
                              decoration: BoxDecoration(
                                color: toneColor(stats[i].tone!),
                                shape: BoxShape.circle,
                              ),
                            ),
                          Flexible(child: Eyebrow(stats[i].label)),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        // Fee figures run to seven-plus digits; scaling down
                        // beats wrapping a rupee amount onto two lines or
                        // ellipsing the most significant digits away.
                        child: Text(
                          stats[i].value,
                          maxLines: 1,
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 21,
                            letterSpacing: -0.7,
                            height: 1.15,
                            color: stats[i].tone != null ? toneColor(stats[i].tone!) : AppColors.ink,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// An inline notice inside a screen body — a rule that applies, a state the
/// user should know about before acting. Tinted to its [tone] with a leading
/// rail rather than boxed in a border, so it reads as an annotation on the
/// page rather than as another panel competing with the content.
class AppBanner extends StatelessWidget {
  const AppBanner({
    super.key,
    required this.message,
    this.tone = Tone.info,
    this.icon,
    this.title,
    this.action,
  });

  final String message;
  final Tone tone;
  final IconData? icon;
  final String? title;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final color = toneColor(tone);

    return Container(
      decoration: BoxDecoration(
        color: toneBackground(tone),
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(width: 3, color: color),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.md, AppSpacing.md, AppSpacing.md),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (icon != null) ...[
                      Icon(icon, size: 18, color: color),
                      const SizedBox(width: AppSpacing.sm + 2),
                    ],
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (title != null)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 2),
                              child: Text(
                                title!,
                                style: TextStyle(
                                  color: toneInk(tone),
                                  fontWeight: FontWeight.w700,
                                  fontSize: 13.5,
                                  height: 1.35,
                                ),
                              ),
                            ),
                          Text(
                            message,
                            style: TextStyle(
                              color: toneInk(tone),
                              fontSize: 13,
                              height: 1.45,
                              fontWeight: title != null ? FontWeight.w500 : FontWeight.w600,
                            ),
                          ),
                          if (action != null)
                            Padding(padding: const EdgeInsets.only(top: AppSpacing.sm), child: action!),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Empty / error states
// ---------------------------------------------------------------------------

/// A centered illustration-weight icon + message for empty lists — every
/// screen's "nothing yet".
///
/// The glyph now sits in a large rounded plaque with a soft ring instead of a
/// flat grey circle, which is what stops an empty screen reading as a broken
/// one.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.message,
    this.title,
    this.action,
    this.tone = Tone.neutral,
  });

  final IconData icon;

  /// The explanatory line. When no [title] is given this is the headline and
  /// is rendered accordingly, so the ~50 existing single-message call sites
  /// still read as a deliberate empty state rather than as a stray caption.
  final String message;
  final String? title;
  final Widget? action;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final hasTitle = title != null;

    return _CenteredMessage(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _StatePlaque(icon: icon, tone: tone),
          const SizedBox(height: AppSpacing.ml),
          Text(
            hasTitle ? title! : message,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
              letterSpacing: -0.4,
              height: 1.3,
            ),
          ),
          if (hasTitle) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.ink3, fontSize: 13.5, height: 1.5),
            ),
          ],
          if (action != null) ...[
            const SizedBox(height: AppSpacing.xl),
            action!,
          ],
        ],
      ),
    );
  }
}

/// The icon plaque shared by [EmptyState] and [ErrorView]: a tinted rounded
/// square inside a wider, fainter ring of the same tint.
class _StatePlaque extends StatelessWidget {
  const _StatePlaque({required this.icon, required this.tone});

  final IconData icon;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final color = toneColor(tone);

    return Container(
      width: 92,
      height: 92,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: toneBackground(tone).withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(AppRadius.xl),
      ),
      child: Container(
        width: 64,
        height: 64,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: toneBackground(tone),
          borderRadius: BorderRadius.circular(AppRadius.lg),
        ),
        child: Icon(icon, size: 28, color: color),
      ),
    );
  }
}

/// Centres a short message block, scrolling it when the viewport is bounded
/// (so it survives large text scales and short landscape viewports, and still
/// works as a `RefreshIndicator` child) and simply padding it when it isn't —
/// several screens render these inside a sliver, where a scroll view would be
/// handed an unbounded height and throw.
class _CenteredMessage extends StatelessWidget {
  const _CenteredMessage({required this.child});

  final Widget child;

  static const _padding = EdgeInsets.symmetric(horizontal: AppSpacing.xxl, vertical: AppSpacing.xxxl);

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (!constraints.hasBoundedHeight) {
          return Padding(padding: _padding, child: Center(child: child));
        }
        return Center(
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: _padding,
            child: child,
          ),
        );
      },
    );
  }
}

/// A centered error message for a failed fetch, with an optional retry.
class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.error, this.onRetry});

  final Object error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final message = error is ApiException ? (error as ApiException).message : 'Something went wrong.';

    return _CenteredMessage(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const _StatePlaque(icon: Icons.cloud_off_outlined, tone: Tone.bad),
          const SizedBox(height: AppSpacing.ml),
          const Text(
            "Couldn't load this",
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
              letterSpacing: -0.4,
              height: 1.3,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.ink3, fontSize: 13.5, height: 1.5),
          ),
          if (onRetry != null) ...[
            const SizedBox(height: AppSpacing.xl),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded, size: 19),
              label: const Text('Try again'),
            ),
          ],
        ],
      ),
    );
  }
}

/// The inline "that didn't work" banner above a form's submit button — one
/// treatment shared by every form so a failed sign-in and a failed password
/// change look like they came from the same app.
class AppErrorBanner extends StatelessWidget {
  const AppErrorBanner(this.message, {super.key});

  final String message;

  @override
  Widget build(BuildContext context) {
    return AppFadeIn(
      child: AppBanner(
        message: message,
        tone: Tone.bad,
        icon: Icons.error_outline_rounded,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Inputs and actions
// ---------------------------------------------------------------------------

/// A form's primary submit button with a built-in busy state.
///
/// The hand-rolled versions of this put a bare `CircularProgressIndicator`
/// inside a `FilledButton`, which picked up the theme's brand colour and so
/// rendered brand-on-brand — an invisible spinner on a button that just looked
/// frozen. This forces the indicator to the button's foreground colour and
/// keeps the button at its normal height while busy so the form doesn't jump.
/// The green-tinted lift drops away while busy or disabled, so "can't press
/// this" is legible before you try.
class AppSubmitButton extends StatelessWidget {
  const AppSubmitButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.busy = false,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !busy;

    final child = busy
        ? const SizedBox(
            height: 20,
            width: 20,
            child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[Icon(icon, size: 19), const SizedBox(width: AppSpacing.sm + 2)],
              Flexible(child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis)),
            ],
          );

    return AnimatedContainer(
      duration: AppMotion.base,
      curve: AppMotion.curve,
      height: 54,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppRadius.md),
        boxShadow: enabled ? AppShadows.brand : const [],
      ),
      child: FilledButton(
        onPressed: busy ? null : onPressed,
        style: busy
            // Keep the brand fill while busy: the theme's disabled style is a
            // flat grey, which would read as "this button stopped working".
            ? FilledButton.styleFrom(
                disabledBackgroundColor: AppColors.brand.withValues(alpha: 0.72),
                disabledForegroundColor: Colors.white,
              )
            : null,
        child: AnimatedSwitcher(duration: AppMotion.fast, child: child),
      ),
    );
  }
}

/// A password field with a show/hide toggle, so the three screens that ask for
/// one all behave the same way instead of only the sign-in screen offering it.
/// Purely presentational — it owns nothing but the obscure flag.
class AppPasswordField extends StatefulWidget {
  const AppPasswordField({
    super.key,
    required this.controller,
    required this.label,
    this.validator,
    this.textInputAction,
    this.onFieldSubmitted,
    this.prefixIcon,
    this.helperText,
  });

  final TextEditingController controller;
  final String label;
  final String? Function(String?)? validator;
  final TextInputAction? textInputAction;
  final void Function(String)? onFieldSubmitted;
  final IconData? prefixIcon;
  final String? helperText;

  @override
  State<AppPasswordField> createState() => _AppPasswordFieldState();
}

class _AppPasswordFieldState extends State<AppPasswordField> {
  bool _obscure = true;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: widget.controller,
      obscureText: _obscure,
      textInputAction: widget.textInputAction,
      onFieldSubmitted: widget.onFieldSubmitted,
      validator: widget.validator,
      style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600, letterSpacing: 0.4),
      decoration: InputDecoration(
        labelText: widget.label,
        helperText: widget.helperText,
        prefixIcon: widget.prefixIcon != null ? Icon(widget.prefixIcon, size: 20) : null,
        suffixIcon: IconButton(
          tooltip: _obscure ? 'Show password' : 'Hide password',
          iconSize: 20,
          icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
          onPressed: () => setState(() => _obscure = !_obscure),
        ),
      ),
    );
  }
}

/// A date picker presented as a themed form field — the input every form's
/// "date of birth"/"date of admission" row used to hand-roll as its own
/// private `_DateField`. Reads the chosen day back through [formatDay]
/// ("31 Aug 2026") instead of the raw ISO string, since that raw form is a
/// wire format, not something a parent or office clerk should have to parse.
class AppDateField extends StatelessWidget {
  const AppDateField({
    super.key,
    required this.label,
    required this.isoValue,
    required this.onTap,
    this.enabled = true,
  });

  final String label;
  final String? isoValue;
  final VoidCallback onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: enabled ? onTap : null,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          suffixIcon: Icon(Icons.calendar_today_outlined, size: 18, color: enabled ? null : AppColors.ink3),
        ),
        child: Text(
          isoValue != null ? formatDay(isoValue!) : 'Not set',
          style: TextStyle(
            fontWeight: FontWeight.w600,
            color: enabled ? AppColors.ink : AppColors.ink3,
          ),
        ),
      ),
    );
  }
}

/// The search field used above every filterable list. A pill with the glyph
/// inside it rather than a boxed field with a label — search is the one input
/// that should read as a control, not as part of a form.
class AppSearchField extends StatelessWidget {
  const AppSearchField({
    super.key,
    required this.controller,
    required this.hintText,
    this.onChanged,
    this.onSubmitted,
    this.autofocus = false,
    this.textInputAction,
    this.keyboardType,
  });

  final TextEditingController controller;
  final String hintText;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final bool autofocus;
  final TextInputAction? textInputAction;
  final TextInputType? keyboardType;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<TextEditingValue>(
      valueListenable: controller,
      builder: (context, value, _) => TextField(
        controller: controller,
        autofocus: autofocus,
        onChanged: onChanged,
        onSubmitted: onSubmitted,
        textInputAction: textInputAction,
        keyboardType: keyboardType,
        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
        decoration: InputDecoration(
          hintText: hintText,
          isDense: true,
          filled: true,
          fillColor: AppColors.card,
          prefixIcon: const Icon(Icons.search_rounded, size: 21),
          // The clear button only exists once there is something to clear —
          // an always-on × on an empty field is a dead target.
          suffixIcon: value.text.isEmpty
              ? null
              : IconButton(
                  tooltip: 'Clear',
                  iconSize: 18,
                  icon: const Icon(Icons.close_rounded),
                  onPressed: () {
                    controller.clear();
                    onChanged?.call('');
                  },
                ),
          contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: 14),
          border: const OutlineInputBorder(
            borderRadius: BorderRadius.all(Radius.circular(AppRadius.pill)),
            borderSide: BorderSide(color: AppColors.line),
          ),
          enabledBorder: const OutlineInputBorder(
            borderRadius: BorderRadius.all(Radius.circular(AppRadius.pill)),
            borderSide: BorderSide(color: AppColors.line),
          ),
          focusedBorder: const OutlineInputBorder(
            borderRadius: BorderRadius.all(Radius.circular(AppRadius.pill)),
            borderSide: BorderSide(color: AppColors.brand, width: 1.6),
          ),
        ),
      ),
    );
  }
}

/// A horizontally scrolling row of filter pills — the one treatment for
/// "narrow this list down", replacing the per-screen mix of `ChoiceChip`,
/// `FilterChip` and hand-built toggles.
///
/// Purely presentational: it reports the tapped index and paints the selected
/// one; which filter that index means stays with the screen.
class AppFilterBar extends StatelessWidget {
  const AppFilterBar({
    super.key,
    required this.labels,
    required this.selectedIndex,
    required this.onSelected,
    this.padding = const EdgeInsets.symmetric(horizontal: AppSpacing.page),
  });

  final List<String> labels;
  final int selectedIndex;
  final ValueChanged<int> onSelected;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: padding,
        physics: const BouncingScrollPhysics(),
        itemCount: labels.length,
        separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.sm),
        itemBuilder: (context, index) {
          final selected = index == selectedIndex;
          return Center(
            child: AppPressable(
              borderRadius: BorderRadius.circular(AppRadius.pill),
              onTap: () {
                HapticFeedback.selectionClick();
                onSelected(index);
              },
              child: AnimatedContainer(
                duration: AppMotion.fast,
                curve: AppMotion.curve,
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm + 2),
                decoration: BoxDecoration(
                  color: selected ? AppColors.brand : AppColors.card,
                  borderRadius: BorderRadius.circular(AppRadius.pill),
                  border: Border.all(color: selected ? AppColors.brand : AppColors.line),
                  boxShadow: selected ? AppShadows.brand : const [],
                ),
                child: Text(
                  labels[index],
                  style: TextStyle(
                    color: selected ? Colors.white : AppColors.ink2,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                    fontSize: 13.5,
                    height: 1.2,
                    letterSpacing: -0.1,
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// The tab strip under an [AppTopBar], as a segmented pill track rather than
/// Material's underlined labels — the underline read as a link on the warm
/// ground and gave the selected tab no weight of its own.
///
/// Pairs with a plain `TabBarView`; it drives whatever `TabController` is in
/// scope exactly as the stock `TabBar` does.
class AppTabBar extends StatelessWidget implements PreferredSizeWidget {
  const AppTabBar({super.key, required this.tabs});

  final List<String> tabs;

  @override
  Size get preferredSize => const Size.fromHeight(64);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.xs, AppSpacing.page, AppSpacing.md),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.paper2,
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
        padding: const EdgeInsets.all(AppSpacing.xs),
        child: TabBar(
          tabs: [
            for (final tab in tabs)
              Tab(
                height: 40,
                // The track is a fixed-height strip, so an accessibility text
                // size has to scale the label down rather than push it out of
                // the pill.
                child: FittedBox(fit: BoxFit.scaleDown, child: Text(tab)),
              ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Loading placeholders
// ---------------------------------------------------------------------------

/// One softly pulsing block. The building block for the skeletons below —
/// a slow opacity breath rather than a travelling shimmer gradient, which
/// stays quiet against the warm paper ground instead of drawing the eye to
/// the placeholder itself.
class AppSkeletonBox extends StatefulWidget {
  const AppSkeletonBox({super.key, this.width, this.height = 12, this.radius = AppRadius.xs});

  final double? width;
  final double height;
  final double radius;

  @override
  State<AppSkeletonBox> createState() => _AppSkeletonBoxState();
}

class _AppSkeletonBoxState extends State<AppSkeletonBox> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween(begin: 0.4, end: 0.85).animate(
        CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
      ),
      child: Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          color: AppColors.line,
          borderRadius: BorderRadius.circular(widget.radius),
        ),
      ),
    );
  }
}

/// The loading state for a screen whose data lands as a list of rows —
/// mirrors the real row's medallion/title/subtitle geometry so the content
/// doesn't jump when it arrives.
class AppListSkeleton extends StatelessWidget {
  /// [hasLeading] defaults off because most list rows in this app are a
  /// title/subtitle pair with a status badge on the right; only the tile-group
  /// style rows carry a leading medallion.
  const AppListSkeleton({super.key, this.rows = 7, this.hasLeading = false, this.hasTrailing = true});

  final int rows;
  final bool hasLeading;
  final bool hasTrailing;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.md, AppSpacing.page, AppSpacing.md),
      itemCount: rows,
      separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
      itemBuilder: (context, index) => AppSurface(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.lg),
        child: Row(
          children: [
            if (hasLeading) ...[
              const AppSkeletonBox(width: 40, height: 40, radius: AppRadius.sm),
              const SizedBox(width: 14),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Alternating widths so the block reads as a list of real
                  // rows of differing length, not as a rigid template.
                  AppSkeletonBox(width: index.isEven ? 158 : 122, height: 13),
                  const SizedBox(height: AppSpacing.sm + 2),
                  AppSkeletonBox(width: index.isEven ? 96 : 138, height: 10),
                ],
              ),
            ),
            if (hasTrailing) ...[
              const SizedBox(width: AppSpacing.md),
              const AppSkeletonBox(width: 54, height: 22, radius: AppRadius.pill),
            ],
          ],
        ),
      ),
    );
  }
}

/// The loading state for a screen whose data lands as stacked cards/panels.
class AppCardsSkeleton extends StatelessWidget {
  const AppCardsSkeleton({super.key, this.cards = 3, this.padding = const EdgeInsets.all(AppSpacing.page)});

  final int cards;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: padding,
      itemCount: cards,
      separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
      itemBuilder: (context, index) => AppSurface(
        padding: const EdgeInsets.all(AppSpacing.ml),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const AppSkeletonBox(width: 84, height: 9),
            const SizedBox(height: AppSpacing.md),
            AppSkeletonBox(width: index.isEven ? 180 : 140, height: 16),
            const SizedBox(height: AppSpacing.md),
            const AppSkeletonBox(width: double.infinity, height: 10),
          ],
        ),
      ),
    );
  }
}

/// The loading state for a detail screen: a summary panel over a run of
/// label/value rows.
class AppDetailSkeleton extends StatelessWidget {
  const AppDetailSkeleton({super.key, this.rows = 6});

  final int rows;

  @override
  Widget build(BuildContext context) {
    return ListView(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.all(AppSpacing.page),
      children: [
        AppSurface(
          padding: const EdgeInsets.all(AppSpacing.ml),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const AppSkeletonBox(width: 190, height: 18),
              const SizedBox(height: AppSpacing.md),
              const AppSkeletonBox(width: 110, height: 11),
              const SizedBox(height: AppSpacing.ml),
              Row(
                children: [
                  const AppSkeletonBox(width: 88, height: 28, radius: AppRadius.pill),
                  const SizedBox(width: AppSpacing.sm),
                  const AppSkeletonBox(width: 72, height: 28, radius: AppRadius.pill),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.ml),
        AppSurface(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
          child: Column(
            children: [
              for (var i = 0; i < rows; i++)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const AppSkeletonBox(width: 84, height: 10),
                      AppSkeletonBox(width: i.isEven ? 118 : 82, height: 10),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

const loadingView = Center(child: CircularProgressIndicator());

/// A small spinner for a control-sized slot — a picker still fetching its
/// options, a preview panel mid-request. The full-size [loadingView] is a
/// 36px indicator, which dwarfs the form row it sits in.
class AppInlineLoader extends StatelessWidget {
  const AppInlineLoader({super.key, this.height = 52});

  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: const Center(
        child: SizedBox(
          height: 20,
          width: 20,
          child: CircularProgressIndicator(strokeWidth: 2.4),
        ),
      ),
    );
  }
}
