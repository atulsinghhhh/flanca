import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/widgets/app_widgets.dart';
import '../home/home_screen.dart';
import 'ptm_slots_screen.dart';

final _schoolSectionsForPtmProvider = FutureProvider((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get<Map<String, dynamic>>('/settings/classes');
  return (data['classes'] as List).cast<Map<String, dynamic>>();
});

/// Mirrors src/app/app/ptm/page.tsx's branch into teacher-view/parent-view —
/// picks which section's slots to open next, from whichever sections the
/// signed-in actor's role-home data already surfaces (their own sections for a
/// teacher, their children's sections for a parent).
class PtmScreen extends ConsumerWidget {
  const PtmScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final home = ref.watch(homeDataProvider);
    final isOffice = ref.watch(authControllerProvider).actor?.isOffice ?? false;

    return Scaffold(
      appBar: AppTopBar(title: 'Parent-teacher meetings'),
      body: home.when(
        loading: () => const AppListSkeleton(),
        error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(homeDataProvider)),
        data: (data) {
          final role = data['role'] as String;
          final homeData = data['home'] as Map<String, dynamic>;

          if (role == 'TEACHER') {
            final sections = (homeData['sections'] as List? ?? []).cast<Map<String, dynamic>>();
            if (sections.isEmpty) {
              return const EmptyState(
                icon: Icons.groups_outlined,
                message: 'You are not a class teacher of any section.',
              );
            }
            return ListView(
              children: sections
                  .map((s) => AppListRow(
                        title: s['label'] as String,
                        subtitle: '${s['strength']} students',
                        showChevron: true,
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => PtmSlotsScreen(
                            sectionId: s['id'] as String,
                            sectionLabel: s['label'] as String,
                            asStaff: true,
                          ),
                        )),
                      ))
                  .toList(),
            );
          }

          if (role == 'PARENT') {
            final children = (homeData['children'] as List? ?? []).cast<Map<String, dynamic>>();
            final withSection = children.where((c) => c['sectionId'] != null).toList();
            if (withSection.isEmpty) {
              return const EmptyState(icon: Icons.face_outlined, message: 'No children found.');
            }
            return ListView(
              children: withSection
                  .map((c) => AppListRow(
                        title: c['name'] as String,
                        subtitle: c['className'] as String? ?? '',
                        showChevron: true,
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => PtmSlotsScreen(
                            sectionId: c['sectionId'] as String,
                            sectionLabel: c['className'] as String? ?? c['name'] as String,
                            asStaff: false,
                            studentId: c['id'] as String,
                          ),
                        )),
                      ))
                  .toList(),
            );
          }

          // Mirrors src/app/app/ptm/page.tsx: office is not scoped to their own
          // sections like a teacher — they can offer, view or cancel slots for
          // any section in the school, same TeacherPtmView, unscoped.
          if (isOffice) return const _OfficeSectionPicker();

          return const EmptyState(
            icon: Icons.event_available_outlined,
            message: 'Parent-teacher meetings are managed by your class teacher.',
          );
        },
      ),
    );
  }
}

class _OfficeSectionPicker extends ConsumerWidget {
  const _OfficeSectionPicker();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(_schoolSectionsForPtmProvider);

    return result.when(
      loading: () => const AppListSkeleton(),
      error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_schoolSectionsForPtmProvider)),
      data: (classes) {
        if (classes.isEmpty) {
          return const EmptyState(icon: Icons.event_available_outlined, title: 'No classes yet', message: 'Classes appear here once the office adds them.');
        }
        return ListView(
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: [
            for (final cls in classes)
              for (final section in (cls['sections'] as List? ?? []).cast<Map<String, dynamic>>())
                AppListRow(
                  title: '${cls['name']} ${section['name']}',
                  subtitle: section['classTeacherName'] != null
                      ? 'Class teacher: ${section['classTeacherName']}'
                      : 'No class teacher assigned',
                  showChevron: true,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => PtmSlotsScreen(
                        sectionId: section['id'] as String,
                        sectionLabel: '${cls['name']} ${section['name']}',
                        asStaff: true,
                      ),
                    ),
                  ),
                ),
          ],
        );
      },
    );
  }
}
