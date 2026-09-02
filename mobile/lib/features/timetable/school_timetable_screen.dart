import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'class_timetable_screen.dart';
import 'master_timetable_screen.dart';

final _schoolClassesProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get<Map<String, dynamic>>('/settings/classes');
  return (data['classes'] as List).cast<Map<String, dynamic>>();
});

/// The office's "browse any class's timetable" entry point — mirrors
/// src/app/app/timetable/page.tsx's class+section picker for office/admin.
/// Every other role's Timetable quick action shows a single, already-known
/// schedule (a teacher's own periods, a student's own class); office has no
/// "own" timetable to default to, so this is a picker first, then reuses the
/// same week-grid screen (ClassTimetableScreen) everyone else lands on.
class SchoolTimetableScreen extends ConsumerWidget {
  const SchoolTimetableScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(_schoolClassesProvider);

    return Scaffold(
      appBar: AppTopBar(
        title: 'School timetable',
        actions: [
          AppIconButton(
            tooltip: 'Whole school, one page',
            icon: Icons.grid_view_rounded,
            tone: Tone.brand,
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const MasterTimetableScreen())),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_schoolClassesProvider),
        child: result.when(
          loading: () => const AppListSkeleton(),
          error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_schoolClassesProvider)),
          data: (classes) {
            if (classes.isEmpty) {
              return const EmptyState(icon: Icons.calendar_view_week_outlined, title: 'No classes yet', message: 'Classes appear here once the office adds them.');
            }
            return ListView(
              padding: const EdgeInsets.fromLTRB(AppSpacing.page, 12, AppSpacing.page, 24),
              children: [
                for (final cls in classes) _ClassGroup(cls: cls),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _ClassGroup extends StatelessWidget {
  const _ClassGroup({required this.cls});

  final Map<String, dynamic> cls;

  @override
  Widget build(BuildContext context) {
    final sections = (cls['sections'] as List? ?? []).cast<Map<String, dynamic>>();
    if (sections.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 8, top: 12),
            child: Text(cls['name'] as String, style: Theme.of(context).textTheme.titleMedium),
          ),
          AppTileGroup(
            tiles: [
              for (final section in sections)
                AppTileSpec(
                  Icons.groups_outlined,
                  section['name'] as String,
                  () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => ClassTimetableScreen(
                        sectionId: section['id'] as String,
                        sectionLabel: '${cls['name']} ${section['name']}',
                        classId: cls['id'] as String,
                      ),
                    ),
                  ),
                  subtitle: section['classTeacherName'] != null
                      ? 'Class teacher: ${section['classTeacherName']}'
                      : 'No class teacher assigned',
                ),
            ],
          ),
        ],
      ),
    );
  }
}
