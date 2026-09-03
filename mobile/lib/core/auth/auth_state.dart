import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../network/api_client.dart';
import '../network/api_exception.dart';
import '../network/token_store.dart';
import '../../models/actor.dart';
import 'session_reset.dart';

enum AuthStatus { unknown, signedOut, mustChangePassword, signedIn }

class AuthState {
  final AuthStatus status;
  final Actor? actor;

  const AuthState({required this.status, this.actor});

  const AuthState.unknown() : this(status: AuthStatus.unknown);
  const AuthState.signedOut() : this(status: AuthStatus.signedOut);
}

final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore(const FlutterSecureStorage()));

/// One ApiClient per app run; its 401-refresh interceptor calls back into
/// [AuthController.signOutLocally] when a refresh ultimately fails, so a
/// stale session always lands the user back on the login screen instead of
/// spinning on requests that can never succeed.
final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(
    tokenStore: ref.read(tokenStoreProvider),
    onSessionExpired: () => ref.read(authControllerProvider.notifier).signOutLocally(),
  );
  return client;
});

final authControllerProvider = NotifierProvider<AuthController, AuthState>(AuthController.new);

class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    Future.microtask(_restore);
    return const AuthState.unknown();
  }

  ApiClient get _api => ref.read(apiClientProvider);
  TokenStore get _tokens => ref.read(tokenStoreProvider);

  Future<void> _restore() async {
    final access = await _tokens.readAccessToken();
    if (access == null) {
      state = const AuthState.signedOut();
      return;
    }
    try {
      final data = await _api.get<Map<String, dynamic>>('/me');
      final actor = Actor.fromJson(data['actor'] as Map<String, dynamic>);
      state = AuthState(
        status: actor.mustChangePassword ? AuthStatus.mustChangePassword : AuthStatus.signedIn,
        actor: actor,
      );
    } on ApiException {
      await _tokens.clear();
      state = const AuthState.signedOut();
    }
  }

  Future<void> signIn({required String identifier, required String password}) async {
    final data = await _api.post<Map<String, dynamic>>('/auth/login', data: {
      'identifier': identifier,
      'password': password,
    });
    await _tokens.save(accessToken: data['accessToken'], refreshToken: data['refreshToken']);
    final actor = Actor.fromJson(data['actor'] as Map<String, dynamic>);
    state = AuthState(
      status: actor.mustChangePassword ? AuthStatus.mustChangePassword : AuthStatus.signedIn,
      actor: actor,
    );
    // A previous account's Home/Timetable/Fees/etc. data must not survive
    // into this one — see session_reset.dart.
    sessionGeneration.value++;
  }

  Future<void> setPassword({required String current, required String next, required String confirm}) async {
    final data = await _api.post<Map<String, dynamic>>('/auth/set-password', data: {
      'current': current,
      'next': next,
      'confirm': confirm,
    });
    await _tokens.save(accessToken: data['accessToken'], refreshToken: data['refreshToken']);
    final actor = state.actor;
    state = AuthState(status: AuthStatus.signedIn, actor: actor);
  }

  Future<void> signOut() async {
    final refreshToken = await _tokens.readRefreshToken();
    if (refreshToken != null) {
      try {
        await _api.post('/auth/logout', data: {'refreshToken': refreshToken});
      } on ApiException {
        // Best-effort — the token is being deleted locally regardless.
      }
    }
    await signOutLocally();
  }

  Future<void> signOutLocally() async {
    await _tokens.clear();
    state = const AuthState.signedOut();
  }
}
