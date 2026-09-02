import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../theme/app_theme.dart';

/// The bottom-nav chrome wrapping the four tab branches. Each branch keeps
/// its own navigation stack (StatefulShellRoute.indexedStack), so pushing a
/// detail screen inside "Connect" doesn't disturb "Home"'s stack underneath.
///
/// The stock `NavigationBar` was a full-width white band welded to the bottom
/// of the screen with a hairline above it — the single most dated piece of
/// chrome in the app. This replaces it with a floating pill that sits *on* the
/// paper ground with the content scrolling to a stop above it. Destinations,
/// their order, and the branch-switching call are untouched.
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  static const _destinations = <_NavSpec>[
    _NavSpec(Icons.space_dashboard_outlined, Icons.space_dashboard_rounded, 'Home'),
    _NavSpec(Icons.forum_outlined, Icons.forum_rounded, 'Connect'),
    _NavSpec(Icons.person_outline_rounded, Icons.person_rounded, 'Profile'),
    _NavSpec(Icons.apps_outlined, Icons.apps_rounded, 'More'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.sm, AppSpacing.lg, AppSpacing.md),
          child: Container(
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(AppRadius.xl),
              boxShadow: AppShadows.raised,
            ),
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.sm),
            child: Row(
              children: [
                for (var i = 0; i < _destinations.length; i++)
                  Expanded(
                    child: _NavItem(
                      spec: _destinations[i],
                      selected: navigationShell.currentIndex == i,
                      onTap: () {
                        // A tick of feedback on the tab bar only — the one
                        // control people hit without looking at it.
                        HapticFeedback.selectionClick();
                        navigationShell.goBranch(
                          i,
                          initialLocation: i == navigationShell.currentIndex,
                        );
                      },
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NavSpec {
  const _NavSpec(this.icon, this.selectedIcon, this.label);

  final IconData icon;
  final IconData selectedIcon;
  final String label;
}

/// One tab. Selected state is carried by a brand-filled pill that grows in
/// behind the glyph, with the label warming from ink3 to brand ink at the same
/// time — two cues, so the state survives both a glance and a colour-blind
/// reader.
class _NavItem extends StatelessWidget {
  const _NavItem({required this.spec, required this.selected, required this.onTap});

  final _NavSpec spec;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: spec.label,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        splashFactory: NoSplash.splashFactory,
        highlightColor: Colors.transparent,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimatedContainer(
                duration: AppMotion.base,
                curve: AppMotion.curve,
                height: 32,
                width: selected ? 56 : 40,
                decoration: BoxDecoration(
                  color: selected ? AppColors.brand : Colors.transparent,
                  borderRadius: BorderRadius.circular(AppRadius.pill),
                  boxShadow: selected ? AppShadows.brand : const [],
                ),
                child: Center(
                  child: AnimatedSwitcher(
                    duration: AppMotion.fast,
                    // Cross-fade with a touch of scale so the switch from the
                    // outlined to the filled glyph reads as one icon changing
                    // weight, not as two icons swapping.
                    transitionBuilder: (child, animation) => FadeTransition(
                      opacity: animation,
                      child: ScaleTransition(scale: Tween(begin: 0.82, end: 1.0).animate(animation), child: child),
                    ),
                    child: Icon(
                      selected ? spec.selectedIcon : spec.icon,
                      key: ValueKey(selected),
                      size: 22,
                      color: selected ? Colors.white : AppColors.ink3,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 5),
              AnimatedDefaultTextStyle(
                duration: AppMotion.base,
                curve: AppMotion.curve,
                style: TextStyle(
                  fontSize: 11,
                  height: 1.1,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  letterSpacing: -0.1,
                  color: selected ? AppColors.brandInk : AppColors.ink3,
                ),
                child: Text(spec.label, maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
