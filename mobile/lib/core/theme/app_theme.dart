import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// The "ledger & slate" palette from src/app/globals.css, carried over so the
/// app reads as the same product as the website: warm paper ground, ink text,
/// institutional green.
///
/// The colours themselves are fixed — what changed in the 2026 pass is how
/// they are *used*: brand green is now reserved for the one primary action and
/// the live/selected state on a screen, ink3 carries all secondary structure,
/// and the tinted `*Light` fills do the work that borders used to.
class AppColors {
  AppColors._();

  static const paper = Color(0xFFFAF8F4);
  static const paper2 = Color(0xFFF4F1EA);
  static const card = Color(0xFFFFFFFF);
  static const ink = Color(0xFF16191D);
  static const ink2 = Color(0xFF3F464E);
  static const ink3 = Color(0xFF6B7480);
  static const line = Color(0xFFE2DDD2);
  static const line2 = Color(0xFFCFC7B8);

  static const brand = Color(0xFF17795E);
  static const brandDark = Color(0xFF0F5443);
  static const brandLight = Color(0xFFE6F2ED);
  static const brandInk = Color(0xFF0B3B30);

  static const marigold = Color(0xFFE0952A);
  static const marigoldLight = Color(0xFFFDF3E2);
  static const overdue = Color(0xFFB3261E);
  static const overdueLight = Color(0xFFFDECEB);
  static const info = Color(0xFF1D5FA8);
  static const infoLight = Color(0xFFE8F0F9);
  static const good = Color(0xFF1F7A44);
  static const goodLight = Color(0xFFE8F4EC);
}

/// The 4pt spacing ladder. Every gap in the app resolves to one of these —
/// nothing is hand-typed any more, which is what stops one screen's "section
/// gap" from being 18px while the next one's is 22.
class AppSpacing {
  AppSpacing._();

  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;

  /// 20 — the gutter a full-bleed panel breathes at, one step above the
  /// dense-list 16.
  static const ml = 20.0;
  static const xl = 24.0;
  static const xxl = 32.0;
  static const xxxl = 40.0;
  static const huge = 48.0;

  /// The horizontal inset every full-width screen body shares, so panels on
  /// one screen line up with panels on the next. Widened from 16 to 20 in the
  /// 2026 pass: content now sits inside soft-shadowed panels rather than
  /// hairline boxes, and needed the extra air to stop reading as edge-to-edge.
  static const page = 20.0;

  /// Bottom padding for a scrolling body under the floating tab bar, so the
  /// last row never ends up trapped behind it.
  static const bottomSafe = 96.0;
}

/// The corner radii. Notably softer than the old 10/12/14 ledger squares —
/// the surfaces now read as physical cards rather than table cells, which is
/// what carries the shadow treatment below.
class AppRadius {
  AppRadius._();

  static const xs = 8.0;
  static const sm = 12.0;
  static const md = 16.0;
  static const lg = 20.0;
  static const xl = 28.0;

  /// Fully-rounded — badges, avatars, the nav bar's active pill.
  static const pill = 999.0;
}

/// Layered, very low-alpha ink shadows. One tight contact shadow plus one wide
/// ambient one: that pairing is what separates a surface from the paper ground
/// without the muddy grey halo a single large blur produces.
class AppShadows {
  AppShadows._();

  /// Resting surfaces — cards, tile groups, list panels.
  static const card = <BoxShadow>[
    BoxShadow(color: Color(0x0A16191D), blurRadius: 2, offset: Offset(0, 1)),
    BoxShadow(color: Color(0x0816191D), blurRadius: 14, offset: Offset(0, 6)),
  ];

  /// Surfaces that sit above other surfaces — sheets, menus, the nav bar.
  static const raised = <BoxShadow>[
    BoxShadow(color: Color(0x0F16191D), blurRadius: 4, offset: Offset(0, 2)),
    BoxShadow(color: Color(0x1416191D), blurRadius: 28, offset: Offset(0, 12)),
  ];

  /// A green-tinted lift for the one primary action on a screen — a neutral
  /// grey shadow under a saturated brand fill reads as dirt.
  static const brand = <BoxShadow>[
    BoxShadow(color: Color(0x2617795E), blurRadius: 16, offset: Offset(0, 8)),
    BoxShadow(color: Color(0x1417795E), blurRadius: 4, offset: Offset(0, 2)),
  ];
}

/// Motion. Everything is short — this is an app people use between periods,
/// not a showreel. [fast] is press feedback, [base] is a state change you
/// should notice, [slow] is the longest anything is allowed to take.
class AppMotion {
  AppMotion._();

  static const fast = Duration(milliseconds: 120);
  static const base = Duration(milliseconds: 220);
  static const slow = Duration(milliseconds: 360);

  /// Decelerating, no overshoot — the standard for anything that moves into
  /// place and stays there.
  static const curve = Curves.easeOutCubic;

  /// A single, restrained bounce for things that *arrive* (a selected nav
  /// indicator, a badge appearing).
  static const emphasized = Curves.easeOutBack;
}

/// A status tone used throughout (attendance marks, homework state, slot
/// booked/open, …) mapped to one consistent colour pair everywhere it appears.
enum Tone { brand, good, warn, bad, info, neutral }

Color toneColor(Tone tone) => switch (tone) {
      Tone.brand => AppColors.brand,
      Tone.good => AppColors.good,
      Tone.warn => AppColors.marigold,
      Tone.bad => AppColors.overdue,
      Tone.info => AppColors.info,
      Tone.neutral => AppColors.ink3,
    };

Color toneBackground(Tone tone) => switch (tone) {
      Tone.brand => AppColors.brandLight,
      Tone.good => AppColors.goodLight,
      Tone.warn => AppColors.marigoldLight,
      Tone.bad => AppColors.overdueLight,
      Tone.info => AppColors.infoLight,
      Tone.neutral => AppColors.paper2,
    };

/// The darker ink of a tone, for text that has to stay legible on top of
/// [toneBackground] at small sizes — the mid-weight [toneColor] passes on
/// white but goes thin on its own tint.
Color toneInk(Tone tone) => switch (tone) {
      Tone.brand => AppColors.brandInk,
      Tone.neutral => AppColors.ink2,
      _ => toneColor(tone),
    };

ThemeData buildAppTheme() {
  final colorScheme = const ColorScheme.light().copyWith(
    primary: AppColors.brand,
    onPrimary: Colors.white,
    primaryContainer: AppColors.brandLight,
    onPrimaryContainer: AppColors.brandInk,
    secondary: AppColors.marigold,
    // Material's baseline light scheme leaves this a lavender (#E8DEF8), and
    // it is what an unstyled selected ChoiceChip and a few other M3 defaults
    // reach for — visibly off-palette against the paper/green system.
    secondaryContainer: AppColors.brandLight,
    onSecondaryContainer: AppColors.brandInk,
    surface: AppColors.paper,
    onSurface: AppColors.ink,
    surfaceContainerHighest: AppColors.paper2,
    error: AppColors.overdue,
    onError: Colors.white,
    outline: AppColors.line,
    outlineVariant: AppColors.line2,
  );

  final base = ThemeData(useMaterial3: true, colorScheme: colorScheme);

  return base.copyWith(
    scaffoldBackgroundColor: AppColors.paper,
    splashFactory: InkSparkle.splashFactory,
    // Tighter tracking and heavier weights at the top of the scale, looser
    // leading at the bottom: the hierarchy now comes from the type itself
    // rather than from boxing every group in a bordered card.
    textTheme: base.textTheme.apply(bodyColor: AppColors.ink, displayColor: AppColors.ink).copyWith(
          displaySmall: base.textTheme.displaySmall?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: -1.2,
            height: 1.05,
          ),
          headlineLarge: base.textTheme.headlineLarge?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: -0.9,
            height: 1.1,
          ),
          headlineMedium: base.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: -0.7,
            height: 1.12,
          ),
          headlineSmall: base.textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: -0.6,
            height: 1.15,
          ),
          titleLarge: base.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.4),
          titleMedium: base.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.2),
          titleSmall: base.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600, letterSpacing: -0.1),
          bodyLarge: base.textTheme.bodyLarge?.copyWith(height: 1.5),
          bodyMedium: base.textTheme.bodyMedium?.copyWith(height: 1.5),
          labelLarge: base.textTheme.labelLarge?.copyWith(
            fontWeight: FontWeight.w700,
            letterSpacing: 0,
          ),
          bodySmall: base.textTheme.bodySmall?.copyWith(color: AppColors.ink3, height: 1.45),
        ),
    // The bar is now transparent and elevation-free by default: screens use
    // AppTopBar (core/widgets/app_widgets.dart), which sits directly on the
    // paper ground and lets the body scroll under it rather than dividing the
    // screen with a chrome band.
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      foregroundColor: AppColors.ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleSpacing: AppSpacing.page,
      toolbarHeight: 60,
      systemOverlayStyle: SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark,
        statusBarBrightness: Brightness.light,
      ),
      iconTheme: IconThemeData(color: AppColors.ink2, size: 22),
      actionsIconTheme: IconThemeData(color: AppColors.ink2, size: 22),
      titleTextStyle: TextStyle(
        color: AppColors.ink,
        fontSize: 21,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.5,
      ),
    ),
    // Page transitions are deliberately left at Flutter's platform defaults —
    // predictive-back on Android, the Cupertino swipe-back on iOS. Overriding
    // them to one shared look costs the back gesture users expect.
    // The hairline border is gone in favour of a soft ink shadow: a border and
    // a shadow together read as two competing edges on the warm ground. Kept
    // in step with AppSurface (core/widgets/app_widgets.dart), which is what
    // rewritten screens use directly.
    cardTheme: CardThemeData(
      color: AppColors.card,
      elevation: 3,
      surfaceTintColor: Colors.transparent,
      shadowColor: const Color(0x2216191D),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.lg)),
      margin: EdgeInsets.zero,
    ),
    listTileTheme: ListTileThemeData(
      iconColor: AppColors.ink2,
      textColor: AppColors.ink,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.sm)),
    ),
    dividerTheme: const DividerThemeData(color: AppColors.line, space: 1, thickness: 1),
    // Borderless at rest, filled with the warm paper2 tint, and a two-tone
    // brand ring on focus — the old white-box-with-a-hairline field was the
    // most dated component in the app.
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.paper2,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        borderSide: const BorderSide(color: Colors.transparent),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        borderSide: const BorderSide(color: AppColors.brand, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        borderSide: const BorderSide(color: AppColors.overdue, width: 1.5),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        borderSide: const BorderSide(color: AppColors.overdue, width: 2),
      ),
      disabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        borderSide: const BorderSide(color: Colors.transparent),
      ),
      labelStyle: const TextStyle(color: AppColors.ink3, fontWeight: FontWeight.w500),
      floatingLabelStyle: const TextStyle(color: AppColors.brand, fontWeight: FontWeight.w700),
      hintStyle: const TextStyle(color: AppColors.ink3, fontWeight: FontWeight.w400),
      helperStyle: const TextStyle(color: AppColors.ink3, fontSize: 12, height: 1.4),
      errorStyle: const TextStyle(color: AppColors.overdue, fontSize: 12, fontWeight: FontWeight.w600, height: 1.4),
      prefixIconColor: AppColors.ink3,
      suffixIconColor: AppColors.ink3,
      contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.lg),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.brand,
        foregroundColor: Colors.white,
        // A visible flat "off" state: Material's default disabled treatment
        // derives from onSurface and turned the brand button a muddy grey.
        disabledBackgroundColor: AppColors.line,
        disabledForegroundColor: AppColors.ink3,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl, vertical: AppSpacing.lg),
        minimumSize: const Size(0, 52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5, letterSpacing: -0.1),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.ink,
        backgroundColor: AppColors.card,
        side: const BorderSide(color: AppColors.line),
        disabledForegroundColor: AppColors.ink3,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl, vertical: AppSpacing.lg),
        minimumSize: const Size(0, 52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5, letterSpacing: -0.1),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppColors.brand,
        minimumSize: const Size(0, 44),
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.sm)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, letterSpacing: -0.1),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        foregroundColor: AppColors.ink2,
        minimumSize: const Size(44, 44),
        shape: const CircleBorder(),
      ),
    ),
    textSelectionTheme: const TextSelectionThemeData(
      cursorColor: AppColors.brand,
      selectionColor: AppColors.brandLight,
      selectionHandleColor: AppColors.brand,
    ),
    // Pill-shaped and borderless when unselected — filter rows now read as a
    // row of soft tokens rather than a row of tiny outlined boxes.
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: AppColors.paper2,
      selectedColor: AppColors.brand,
      checkmarkColor: Colors.white,
      labelStyle: const TextStyle(color: AppColors.ink2, fontWeight: FontWeight.w600, fontSize: 13),
      secondaryLabelStyle: const TextStyle(
        color: Colors.white,
        fontWeight: FontWeight.w700,
        fontSize: 13,
      ),
      side: BorderSide.none,
      shape: const StadiumBorder(),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
      showCheckmark: false,
      elevation: 0,
      pressElevation: 0,
    ),
    // The menu a DropdownButtonFormField opens is a separate surface from the
    // field itself and otherwise defaults to Material's own canvas colour.
    dropdownMenuTheme: DropdownMenuThemeData(
      menuStyle: MenuStyle(
        backgroundColor: WidgetStateProperty.all(AppColors.card),
        surfaceTintColor: WidgetStateProperty.all(Colors.transparent),
        elevation: WidgetStateProperty.all(8),
        shape: WidgetStateProperty.all(
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
        ),
      ),
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: AppColors.brand,
      foregroundColor: Colors.white,
      // Flat: the lift comes from AppShadows.brand painted by the wrapper in
      // app_widgets.dart, which is green-tinted rather than grey.
      elevation: 0,
      focusElevation: 0,
      hoverElevation: 0,
      highlightElevation: 0,
      extendedTextStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15, letterSpacing: -0.1),
      extendedPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.ml),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.lg)),
    ),
    // Kept in sync with the custom bar in core/widgets/app_shell.dart so any
    // stray stock NavigationBar still lands on-palette.
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.card,
      indicatorColor: AppColors.brandLight,
      indicatorShape: const StadiumBorder(),
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      height: 68,
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          fontSize: 11,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          color: selected ? AppColors.brandInk : AppColors.ink3,
        );
      }),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return IconThemeData(color: selected ? AppColors.brandInk : AppColors.ink3, size: 23);
      }),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: AppColors.brand,
      linearTrackColor: AppColors.paper2,
      circularTrackColor: Colors.transparent,
      strokeCap: StrokeCap.round,
    ),
    // A pill-track indicator instead of the 2px underline: the selected tab
    // now reads as a chip in a segmented track rather than a link.
    tabBarTheme: TabBarThemeData(
      indicator: const BoxDecoration(color: AppColors.brand, shape: BoxShape.rectangle, borderRadius: BorderRadius.all(Radius.circular(AppRadius.md))),
      indicatorSize: TabBarIndicatorSize.tab,
      dividerColor: Colors.transparent,
      labelColor: Colors.white,
      unselectedLabelColor: AppColors.ink3,
      labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5, letterSpacing: -0.1),
      unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, letterSpacing: -0.1),
      overlayColor: WidgetStateProperty.all(Colors.transparent),
      splashFactory: NoSplash.splashFactory,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: AppColors.card,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.xl)),
      insetPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl, vertical: AppSpacing.xl),
      titleTextStyle: const TextStyle(
        color: AppColors.ink,
        fontSize: 19,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.4,
      ),
      contentTextStyle: const TextStyle(color: AppColors.ink2, fontSize: 14.5, height: 1.5),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: AppColors.card,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      showDragHandle: true,
      dragHandleColor: AppColors.line2,
      dragHandleSize: Size(40, 4),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: AppColors.ink,
      contentTextStyle: const TextStyle(color: Colors.white, fontSize: 14, height: 1.4, fontWeight: FontWeight.w500),
      actionTextColor: AppColors.marigold,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
      behavior: SnackBarBehavior.floating,
      insetPadding: const EdgeInsets.all(AppSpacing.lg),
      elevation: 8,
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(
        color: AppColors.ink,
        borderRadius: BorderRadius.circular(AppRadius.xs),
      ),
      textStyle: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w500),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: 7),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: SegmentedButton.styleFrom(
        backgroundColor: AppColors.paper2,
        foregroundColor: AppColors.ink2,
        selectedBackgroundColor: AppColors.brand,
        selectedForegroundColor: Colors.white,
        side: BorderSide.none,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5, letterSpacing: -0.1),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.sm)),
      ),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? Colors.white : AppColors.card,
      ),
      trackColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? AppColors.brand : AppColors.line,
      ),
      trackOutlineColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? AppColors.brand : AppColors.line2,
      ),
      trackOutlineWidth: WidgetStateProperty.all(1),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? AppColors.brand : Colors.transparent,
      ),
      checkColor: WidgetStateProperty.all(Colors.white),
      side: const BorderSide(color: AppColors.line2, width: 1.5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
    ),
    radioTheme: RadioThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? AppColors.brand : AppColors.line2,
      ),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: AppColors.card,
      surfaceTintColor: Colors.transparent,
      elevation: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
      textStyle: const TextStyle(color: AppColors.ink, fontSize: 14.5, fontWeight: FontWeight.w500),
    ),
    datePickerTheme: DatePickerThemeData(
      backgroundColor: AppColors.card,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      headerBackgroundColor: AppColors.brand,
      headerForegroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.xl)),
      todayBorder: const BorderSide(color: AppColors.brand, width: 1.5),
    ),
    timePickerTheme: TimePickerThemeData(
      backgroundColor: AppColors.card,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.xl)),
      dialBackgroundColor: AppColors.paper2,
    ),
  );
}
