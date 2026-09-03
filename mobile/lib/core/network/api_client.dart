import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_exception.dart';
import 'token_store.dart';

/// Base URL of the Next.js mobile API (src/app/api/mobile/v1). Defaults to
/// the deployed Azure Container App so release builds work on any device
/// out of the box. Override per environment with
/// `--dart-define=API_BASE_URL=...`, e.g. for local dev against a server
/// running on your machine (on a physical device or emulator `localhost`
/// means the device itself, not your dev machine — use your LAN IP or
/// 10.0.2.2 for the Android emulator instead).
const _apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue:
      'https://flanca-app.proudstone-deb2fdad.centralindia.azurecontainerapps.io/api/mobile/v1',
);

typedef VoidCallback = void Function();

/// Wraps Dio with the bearer-token + refresh-and-retry dance every mobile
/// route (src/app/api/mobile/v1/**) expects. Construct one instance and share
/// it — the refresh lock lives on this object.
class ApiClient {
  ApiClient({TokenStore? tokenStore, this._onSessionExpired})
      : _tokenStore = tokenStore ?? TokenStore(const FlutterSecureStorage()) {
    _dio = Dio(BaseOptions(baseUrl: _apiBaseUrl, connectTimeout: const Duration(seconds: 15)));
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _tokenStore.readAccessToken();
        if (token != null) options.headers['Authorization'] = 'Bearer $token';
        handler.next(options);
      },
      onError: (error, handler) async {
        final response = error.response;
        if (response?.statusCode != 401 || _isAuthRoute(error.requestOptions.path)) {
          return handler.next(error);
        }

        final refreshed = await _refreshOnce();
        if (!refreshed) {
          await _tokenStore.clear();
          _onSessionExpired?.call();
          return handler.next(error);
        }

        try {
          final retried = await _dio.fetch(error.requestOptions);
          return handler.resolve(retried);
        } on DioException catch (retryError) {
          return handler.next(retryError);
        }
      },
    ));
  }

  late final Dio _dio;
  final TokenStore _tokenStore;
  final VoidCallback? _onSessionExpired;
  Future<bool>? _refreshInFlight;

  bool _isAuthRoute(String path) => path.contains('/auth/login') || path.contains('/auth/refresh');

  /// Only one refresh call in flight at a time — concurrent 401s from several
  /// requests share the same outcome instead of racing separate rotations
  /// (the backend revokes the old refresh token on every use).
  Future<bool> _refreshOnce() {
    return _refreshInFlight ??= _doRefresh().whenComplete(() => _refreshInFlight = null);
  }

  Future<bool> _doRefresh() async {
    final refreshToken = await _tokenStore.readRefreshToken();
    if (refreshToken == null) return false;
    try {
      final response = await _dio.post('/auth/refresh', data: {'refreshToken': refreshToken});
      final data = response.data['data'];
      await _tokenStore.save(accessToken: data['accessToken'], refreshToken: data['refreshToken']);
      return true;
    } on DioException {
      return false;
    }
  }

  TokenStore get tokenStore => _tokenStore;

  Future<T> get<T>(String path, {Map<String, dynamic>? query}) =>
      _unwrap(_dio.get(path, queryParameters: query));

  Future<T> post<T>(String path, {Object? data}) => _unwrap(_dio.post(path, data: data));

  Future<T> patch<T>(String path, {Object? data}) => _unwrap(_dio.patch(path, data: data));

  Future<T> put<T>(String path, {Object? data}) => _unwrap(_dio.put(path, data: data));

  Future<T> delete<T>(String path, {Object? data}) => _unwrap(_dio.delete(path, data: data));

  Future<T> _unwrap<T>(Future<Response> request) async {
    try {
      final response = await request;
      return response.data['data'] as T;
    } on DioException catch (e) {
      if (e.response != null) {
        throw ApiException.fromResponseData(e.response!.statusCode ?? 0, e.response!.data);
      }
      throw ApiException(status: 0, code: 'network_error', message: 'Could not reach the server.');
    }
  }
}
