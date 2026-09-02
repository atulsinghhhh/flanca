import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:mobile/app.dart';
import 'package:mobile/core/network/token_store.dart';
import 'package:mobile/core/auth/auth_state.dart';

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

void main() {
  testWidgets('shows the sign-in screen when signed out', (WidgetTester tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [tokenStoreProvider.overrideWithValue(_FakeTokenStore())],
      child: const FlancaApp(),
    ));

    // AuthController resolves "no token → signed out" on the next microtask;
    // a couple of pumps is enough without needing pumpAndSettle (the loading
    // spinner it briefly shows animates forever, so pumpAndSettle never
    // returns on its own).
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.text('Sign in'), findsOneWidget);
  });
}
