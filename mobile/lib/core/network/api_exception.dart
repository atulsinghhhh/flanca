/// Mirrors the backend's `{error:{code,message}}` envelope (see
/// src/lib/mobile/response.ts on the Next.js side).
class ApiException implements Exception {
  final int status;
  final String code;
  final String message;

  const ApiException({required this.status, required this.code, required this.message});

  factory ApiException.fromResponseData(int status, dynamic data) {
    if (data is Map && data['error'] is Map) {
      final error = data['error'] as Map;
      return ApiException(
        status: status,
        code: (error['code'] as String?) ?? 'unknown_error',
        message: (error['message'] as String?) ?? 'Something went wrong.',
      );
    }
    return ApiException(status: status, code: 'unknown_error', message: 'Something went wrong.');
  }

  bool get isAuthError => status == 401;
  bool get mustChangePassword => code == 'must_change_password';

  @override
  String toString() => message;
}
