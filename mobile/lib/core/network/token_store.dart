import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Wraps the platform keychain/keystore for the two tokens the mobile auth API
/// issues (src/app/api/mobile/v1/auth/login/route.ts). Never held in memory
/// longer than a request needs — always re-read here.
class TokenStore {
  TokenStore(this._storage);

  final FlutterSecureStorage _storage;

  static const _accessKey = 'flanca_access_token';
  static const _refreshKey = 'flanca_refresh_token';

  Future<String?> readAccessToken() => _storage.read(key: _accessKey);
  Future<String?> readRefreshToken() => _storage.read(key: _refreshKey);

  Future<void> save({required String accessToken, required String refreshToken}) async {
    await _storage.write(key: _accessKey, value: accessToken);
    await _storage.write(key: _refreshKey, value: refreshToken);
  }

  Future<void> saveAccessToken(String accessToken) =>
      _storage.write(key: _accessKey, value: accessToken);

  Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
  }
}
