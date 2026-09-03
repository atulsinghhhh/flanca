import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../profile/profile_screen.dart' show staffMeProvider;

final _registerProvider = FutureProvider.family<Map<String, dynamic>, ({String sectionId, String month})>(
  (ref, args) async {
    final api = ref.watch(apiClientProvider);
    return api.get<Map<String, dynamic>>('/attendance/register', query: {'sectionId': args.sectionId, 'month': args.month});
  },
);

const _marks = {
  'PRESENT': ('P', AppColors.good),
  'ABSENT': ('A', AppColors.overdue),
  'LATE': ('L', AppColors.marigold),
  'HALF_DAY': ('½', AppColors.marigold),
  'LEAVE': ('LV', AppColors.ink3),
};

String _monthKey(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}';

/// A class teacher's whole-month attendance grid for their own section —
/// mirrors src/app/app/attendance/register/page.tsx (minus the print
/// layout, which doesn't translate to a phone screen; the data is the point).
class AttendanceRegisterScreen extends ConsumerStatefulWidget {
  const AttendanceRegisterScreen({super.key, required this.sectionId, required this.sectionLabel});

  final String sectionId;
  final String sectionLabel;

  @override
  ConsumerState<AttendanceRegisterScreen> createState() => _AttendanceRegisterScreenState();
}

class _AttendanceRegisterScreenState extends ConsumerState<AttendanceRegisterScreen> {
  late DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);

  @override
  Widget build(BuildContext context) {
    final args = (sectionId: widget.sectionId, month: _monthKey(_month));
    final result = ref.watch(_registerProvider(args));

    return Scaffold(
      appBar: AppTopBar(title: widget.sectionLabel),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton(
                  icon: const Icon(Icons.chevron_left),
                  onPressed: () => setState(() => _month = DateTime(_month.year, _month.month - 1)),
                ),
                Text(
                  '${_month.month}/${_month.year}',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                ),
                IconButton(
                  icon: const Icon(Icons.chevron_right),
                  onPressed: () => setState(() => _month = DateTime(_month.year, _month.month + 1)),
                ),
              ],
            ),
          ),
          Expanded(
            child: result.when(
              loading: () => const AppListSkeleton(rows: 8),
              error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_registerProvider(args))),
              data: (data) {
                final days = (data['days'] as List).cast<Map<String, dynamic>>();
                final students = (data['students'] as List).cast<Map<String, dynamic>>();
                if (students.isEmpty) {
                  return const EmptyState(icon: Icons.groups_outlined, title: 'No students', message: 'This section has nobody on its roll yet.');
                }

                return SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: DataTable(
                    columnSpacing: 14,
                    headingRowHeight: 36,
                    dataRowMinHeight: 32,
                    dataRowMaxHeight: 32,
                    columns: [
                      const DataColumn(label: Text('Student', style: TextStyle(fontWeight: FontWeight.w700))),
                      for (final d in days) DataColumn(label: Text('${d['day']}')),
                      const DataColumn(label: Text('%')),
                    ],
                    rows: [
                      for (final s in students)
                        DataRow(cells: [
                          DataCell(Text(s['name'] as String, style: const TextStyle(fontWeight: FontWeight.w600))),
                          for (final d in days) DataCell(_MarkCell(day: d, marks: s['marks'] as Map<String, dynamic>)),
                          DataCell(Text('${(((s['summary'] as Map)['percentBp'] as int) / 100).toStringAsFixed(0)}%')),
                        ]),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _MarkCell extends StatelessWidget {
  const _MarkCell({required this.day, required this.marks});

  final Map<String, dynamic> day;
  final Map<String, dynamic> marks;

  @override
  Widget build(BuildContext context) {
    if (day['nonTeaching'] == true || day['holiday'] != null) {
      return const Text('—', style: TextStyle(color: AppColors.ink3));
    }
    final status = marks['${day['day']}'] as String?;
    if (status == null) return const Text('—', style: TextStyle(color: AppColors.ink3));
    final mark = _marks[status];
    if (mark == null) return const Text('—', style: TextStyle(color: AppColors.ink3));
    return Text(mark.$1, style: TextStyle(color: mark.$2, fontWeight: FontWeight.w700));
  }
}

/// Section-picker entry point: office chooses from the whole school (reuses
/// /settings/classes), a class teacher only sees the section(s) they own
/// (from /staff/me's classTeacherOf, already fetched for the Home dashboard).
final classesProvider = FutureProvider((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get<Map<String, dynamic>>('/settings/classes');
  return (data['classes'] as List).cast<Map<String, dynamic>>();
});

class AttendanceRegisterPickerScreen extends ConsumerWidget {
  const AttendanceRegisterPickerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isOffice = ref.watch(authControllerProvider).actor?.isOffice ?? false;

    return Scaffold(
      appBar: AppTopBar(title: 'Attendance register'),
      body: isOffice ? const _OfficeSectionList() : const _MySectionList(),
    );
  }
}

class _MySectionList extends ConsumerWidget {
  const _MySectionList();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(staffMeProvider);
    return result.when(
      loading: () => const AppListSkeleton(),
      error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(staffMeProvider)),
      data: (data) {
        final sections = (data['classTeacherOf'] as List? ?? []).cast<Map<String, dynamic>>();
        if (sections.isEmpty) {
          return const EmptyState(icon: Icons.groups_outlined, title: 'No class assigned', message: 'The register opens for the section you are class teacher of.');
        }
        return ListView.separated(
          itemCount: sections.length,
          separatorBuilder: (_, _) => const Divider(height: 1, indent: AppSpacing.page, endIndent: AppSpacing.page),
          itemBuilder: (context, index) {
            final s = sections[index];
            final label = '${s['className']} ${s['sectionName']}';
            return AppListRow(
              title: label,
              showChevron: true,
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => AttendanceRegisterScreen(sectionId: s['sectionId'] as String, sectionLabel: label),
                ),
              ),
            );
          },
        );
      },
    );
  }
}

class _OfficeSectionList extends ConsumerWidget {
  const _OfficeSectionList();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(classesProvider);
    return result.when(
      loading: () => const AppListSkeleton(),
      error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(classesProvider)),
      data: (classes) {
        if (classes.isEmpty) return const EmptyState(icon: Icons.groups_outlined, title: 'No classes yet', message: 'Classes appear here once the office adds them.');
        return ListView(
          children: [
            for (final cls in classes)
              for (final section in (cls['sections'] as List).cast<Map<String, dynamic>>())
                AppListRow(
                  title: '${cls['name']} ${section['name']}',
                  showChevron: true,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => AttendanceRegisterScreen(
                        sectionId: section['id'] as String,
                        sectionLabel: '${cls['name']} ${section['name']}',
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
