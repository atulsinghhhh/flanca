import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/widgets/app_widgets.dart';
import '../profile/student_profile_screen.dart' show studentProfileProvider;
import 'class_timetable_screen.dart';
import '../../core/theme/app_theme.dart';

/// The Home dashboard's "Timetable" quick action used to send every role
/// into TimetableScreen (a staff member's own periods, backed by the
/// staff-only /timetable/me — 404 for anyone without a Staff row). A
/// student's timetable is their CLASS's timetable, so this reuses the same
/// section-week grid a class teacher sees (ClassTimetableScreen,
/// /timetable/sections/{id} — open to any authenticated actor in the school).
class MyTimetableScreen extends ConsumerWidget {
  const MyTimetableScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(studentProfileProvider);

    return result.when(
      loading: () => const Scaffold(body: AppCardsSkeleton()),
      error: (err, _) => Scaffold(
        appBar: AppTopBar(title: 'Timetable'),
        body: ErrorView(error: err, onRetry: () => ref.invalidate(studentProfileProvider)),
      ),
      data: (data) {
        final childrenRaw = data['children'] as List?;
        final profiles = childrenRaw != null ? childrenRaw.cast<Map<String, dynamic>>() : [data];

        if (profiles.length == 1) {
          final student = profiles.first['student'] as Map<String, dynamic>?;
          final sectionId = student?['sectionId'] as String?;
          if (sectionId == null) {
            return const Scaffold(
              body: EmptyState(icon: Icons.calendar_view_week_outlined, title: 'No class assigned', message: 'Your timetable appears once you are placed in a section.'),
            );
          }
          final className = (student?['class'] as Map?)?['name'] as String? ?? '';
          final sectionName = (student?['section'] as Map?)?['name'] as String? ?? '';
          return ClassTimetableScreen(sectionId: sectionId, sectionLabel: '$className $sectionName'.trim());
        }

        return Scaffold(
          appBar: AppTopBar(title: 'Timetable'),
          body: ListView(
            padding: const EdgeInsets.all(AppSpacing.ml),
            children: [
              for (final profile in profiles)
                Builder(builder: (context) {
                  final student = profile['student'] as Map<String, dynamic>?;
                  final sectionId = student?['sectionId'] as String?;
                  if (student == null || sectionId == null) return const SizedBox.shrink();
                  final className = (student['class'] as Map?)?['name'] as String? ?? '';
                  final sectionName = (student['section'] as Map?)?['name'] as String? ?? '';
                  final label = '$className $sectionName'.trim();

                  final name = student['name'] as String? ?? '';

                  return AppSurface(
                    margin: const EdgeInsets.only(bottom: AppSpacing.md),
                    clip: true,
                    child: AppListRow(
                      leading: AppAvatar(name: name, size: 42),
                      title: name,
                      subtitle: label,
                      showChevron: true,
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => ClassTimetableScreen(sectionId: sectionId, sectionLabel: label)),
                      ),
                    ),
                  );
                }),
            ],
          ),
        );
      },
    );
  }
}
