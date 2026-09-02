import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_state.dart';
import '../../features/auth/login_screen.dart';
import '../../features/auth/set_password_screen.dart';
import '../../features/home/home_screen.dart';
import '../../features/chat/chat_inbox_screen.dart';
import '../../features/profile/profile_screen.dart';
import '../../features/more/more_screen.dart';
import '../widgets/app_shell.dart';

/// Mirrors src/lib/session.ts::requireActor's redirect chain: no session →
/// /login, must-change-password → /set-password, otherwise into the app —
/// which now lives behind a bottom-nav shell (Home / Chat / Profile /
/// More) instead of one flat screen, so it reads as an app rather than a
/// single page with a list of links. Notifications moved off the tab bar —
/// it's reachable from Home's bell instead (features/home/home_screen.dart).
final routerProvider = Provider<GoRouter>((ref) {
  final authListenable = _AuthListenable(ref);
  ref.onDispose(authListenable.dispose);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: authListenable,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final path = state.matchedLocation;

      if (auth.status == AuthStatus.unknown) return null;

      if (auth.status == AuthStatus.signedOut) {
        return path == '/login' ? null : '/login';
      }
      if (auth.status == AuthStatus.mustChangePassword) {
        return path == '/set-password' ? null : '/set-password';
      }
      if (path == '/login' || path == '/set-password') return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/set-password', builder: (context, state) => const SetPasswordScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => AppShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(path: '/', builder: (context, state) => const HomeScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/chat', builder: (context, state) => const ChatInboxScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/profile', builder: (context, state) => const ProfileScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/more', builder: (context, state) => const MoreScreen()),
          ]),
        ],
      ),
    ],
  );
});

class _AuthListenable extends ChangeNotifier {
  _AuthListenable(this._ref) {
    _sub = _ref.listen(authControllerProvider, (_, _) => notifyListeners());
  }

  final Ref _ref;
  late final ProviderSubscription _sub;

  @override
  void dispose() {
    _sub.close();
    super.dispose();
  }
}
