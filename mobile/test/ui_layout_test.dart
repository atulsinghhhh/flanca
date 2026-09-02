import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:mobile/app.dart';
import 'package:mobile/core/auth/auth_state.dart';
import 'package:mobile/core/network/token_store.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/widgets/app_widgets.dart';

/// A TokenStore backed by memory instead of the platform keychain — the real
/// one has no plugin implementation under `flutter test`.
class _FakeTokenStore implements TokenStore {
  @override
  Future<String?> readAccessToken() async => null;
  @override
  Future<String?> readRefreshToken() async => null;
  @override
  Future<void> save({required String accessToken, required String refreshToken}) async {}
  @override
  Future<void> saveAccessToken(String accessToken) async {}
  @override
  Future<void> clear() async {}
}

/// The viewports the shared widgets have to survive: a small phone, an
/// ordinary phone, and a tablet.
const _sizes = <String, Size>{
  'small phone': Size(320, 568),
  'phone': Size(390, 844),
  'tablet': Size(834, 1112),
};

/// 1.0 is the default; 2.0 is roughly the largest accessibility text size a
/// user can set on both platforms, and is where fixed-height layouts break.
const _textScales = <double>[1.0, 1.3, 2.0];

Future<void> _pumpAt(
  WidgetTester tester,
  Widget child, {
  required Size size,
  required double textScale,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: buildAppTheme(),
      home: MediaQuery(
        data: MediaQueryData(size: size, textScaler: TextScaler.linear(textScale)),
        child: Scaffold(body: child),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 400));
}

/// Every shared widget, rendered at every viewport and text scale. A layout
/// overflow surfaces as a thrown FlutterError, so `takeException` returning
/// null is the assertion that nothing overflowed.
void main() {
  final cases = <String, Widget Function()>{
    'EmptyState (message only)': () => const EmptyState(
          icon: Icons.inbox_outlined,
          message: 'No homework yet.',
        ),
    'EmptyState (title + action)': () => EmptyState(
          icon: Icons.inbox_outlined,
          title: 'No homework',
          message: 'Assignments appear here once they are set.',
          action: FilledButton(onPressed: () {}, child: const Text('Set homework')),
        ),
    'ErrorView': () => ErrorView(error: Exception('boom'), onRetry: () {}),
    'AppListSkeleton': () => const AppListSkeleton(rows: 4),
    'AppListSkeleton (leading)': () => const AppListSkeleton(rows: 4, hasLeading: true),
    'AppCardsSkeleton': () => const AppCardsSkeleton(cards: 2),
    'AppDetailSkeleton': () => const AppDetailSkeleton(rows: 3),
    'AppInlineLoader': () => const AppInlineLoader(),
    'SectionHeader': () => SectionHeader('Quick actions', actionLabel: 'See all', onAction: () {}),
    'AppErrorBanner': () => const AppErrorBanner('That password was not recognised.'),
    'AppSubmitButton': () => AppSubmitButton(label: 'Save password', onPressed: () {}),
    'AppSubmitButton (busy)': () => AppSubmitButton(label: 'Save password', busy: true, onPressed: () {}),
    'AppPasswordField': () => AppPasswordField(
          controller: TextEditingController(),
          label: 'Confirm new password',
          helperText: 'At least 8 characters',
          prefixIcon: Icons.lock_outline,
        ),
    'AppSummaryCard': () => const AppSummaryCard(
          stats: [
            AppStat(label: 'Collected', value: '₹12,34,567'),
            AppStat(label: 'Outstanding', value: '₹98,76,543', tone: Tone.bad),
          ],
        ),
    'AppTileGroup': () => AppTileGroup(
          tiles: [
            AppTileSpec(Icons.payments_outlined, 'Fee collection', () {}),
            AppTileSpec(Icons.logout_rounded, 'Sign out', () {},
                tone: Tone.bad, trailing: const SizedBox.shrink()),
          ],
        ),
    'AppStatChip row': () => const Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            AppStatChip(label: '3 sections to mark', icon: Icons.pending_outlined, tone: Tone.warn),
            AppStatChip(label: '92% attendance', tone: Tone.good),
          ],
        ),
    'ToneBadge': () => const ToneBadge('SUBMITTED', tone: Tone.good, icon: Icons.check),
    'AppActionCard grid': () => GridView.count(
          crossAxisCount: 2,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          children: [
            AppActionCard(
              icon: Icons.checklist_rounded,
              label: 'Attendance',
              tone: Tone.good,
              onTap: () {},
            ),
            AppActionCard(
              icon: Icons.calendar_view_week_rounded,
              label: 'Timetable',
              tone: Tone.warn,
              onTap: () {},
            ),
          ],
        ),
  };

  for (final entry in cases.entries) {
    for (final size in _sizes.entries) {
      for (final scale in _textScales) {
        testWidgets('${entry.key} lays out on ${size.key} at ${scale}x text', (tester) async {
          await _pumpAt(tester, entry.value(), size: size.value, textScale: scale);
          expect(tester.takeException(), isNull);
        });
      }
    }
  }

  // The one full screen reachable without a signed-in session, and the most
  // layout-sensitive: a hero, three fields and a button in one column.
  for (final size in _sizes.entries) {
    for (final scale in _textScales) {
      testWidgets('sign-in screen lays out on ${size.key} at ${scale}x text', (tester) async {
        tester.view.physicalSize = size.value;
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.reset);

        await tester.pumpWidget(
          ProviderScope(
            overrides: [tokenStoreProvider.overrideWithValue(_FakeTokenStore())],
            child: MediaQuery(
              data: MediaQueryData(size: size.value, textScaler: TextScaler.linear(scale)),
              child: const FlancaApp(),
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));

        expect(tester.takeException(), isNull);
        expect(find.text('Welcome back'), findsOneWidget);
      });
    }
  }
}
