import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';

/// A student's own record, or a parent's children — mirrors the read side of
/// src/app/app/students/[id]/page.tsx, scoped to "my own record" rather than
/// the office's full directory (that stays office-only/web-only). Shared by
/// the Profile tab, and the "my attendance"/"my timetable" screens the Home
/// dashboard's quick actions send a student/parent to.
final studentProfileProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/students/me');
});
