/// Mirrors the `actor` shape returned by /auth/login, /me, /auth/refresh
/// (src/lib/session.ts::Actor plus mustChangePassword).
class Actor {
  final String id;
  final String name;
  final String email;
  final String schoolId;
  final List<String> roles;
  final bool mustChangePassword;

  const Actor({
    required this.id,
    required this.name,
    required this.email,
    required this.schoolId,
    required this.roles,
    required this.mustChangePassword,
  });

  factory Actor.fromJson(Map<String, dynamic> json) => Actor(
        id: json['id'] as String,
        name: json['name'] as String,
        email: json['email'] as String,
        schoolId: json['schoolId'] as String,
        roles: (json['roles'] as List).cast<String>(),
        mustChangePassword: json['mustChangePassword'] as bool? ?? false,
      );

  bool hasRole(String role) => roles.contains(role);
  bool hasAnyRole(Iterable<String> allowed) => allowed.any(roles.contains);

  static const office = ['OWNER', 'PRINCIPAL', 'ADMIN'];
  static const teaching = ['OWNER', 'PRINCIPAL', 'ADMIN', 'TEACHER'];
  static const money = ['OWNER', 'PRINCIPAL', 'ADMIN', 'ACCOUNTANT'];
  static const library = ['OWNER', 'PRINCIPAL', 'ADMIN', 'LIBRARIAN'];

  bool get isOffice => hasAnyRole(office);
  bool get isTeaching => hasAnyRole(teaching);
  bool get isMoney => hasAnyRole(money);
  bool get isLibrary => hasAnyRole(library);
}
