import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

final staffAttendanceProvider = FutureProvider((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/attendance/staff');
});

Tone _toneForStatus(String? status) => switch (status) {
  'PRESENT' => Tone.good,
  'LATE' => Tone.warn,
  'LEAVE' => Tone.info,
  'ABSENT' => Tone.bad,
  _ => Tone.neutral,
};

/// Office/principal view of today's staff attendance — every teacher's own
/// self-mark (attendance/staff/me) rolled up in one register, plus approved
/// leave. Mirrors the totals src/app/app/attendance/page.tsx shows for staff.
class StaffAttendanceScreen extends ConsumerStatefulWidget {
  const StaffAttendanceScreen({super.key});

  @override
  ConsumerState<StaffAttendanceScreen> createState() =>
      _StaffAttendanceScreenState();
}

class _StaffAttendanceScreenState extends ConsumerState<StaffAttendanceScreen> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final result = ref.watch(staffAttendanceProvider);

    return Scaffold(
      appBar: AppTopBar(title: 'Staff attendance'),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(staffAttendanceProvider),
        child: result.when(
          loading: () => const AppListSkeleton(rows: 8),
          error: (err, _) => ErrorView(
            error: err,
            onRetry: () => ref.invalidate(staffAttendanceProvider),
          ),
          data: (data) {
            final allRows = (data['rows'] as List).cast<Map<String, dynamic>>();
            final totals = data['totals'] as Map<String, dynamic>?;

            if (allRows.isEmpty) {
              return const EmptyState(
                icon: Icons.badge_outlined,
                title: 'No staff on record',
                message: 'Active staff members will be listed here.',
              );
            }

            final q = _query.trim().toLowerCase();
            final rows = q.isEmpty
                ? allRows
                : allRows
                      .where(
                        (r) => (r['name'] as String).toLowerCase().contains(q),
                      )
                      .toList();

            return ListView(
              padding: const EdgeInsets.only(bottom: 16),
              children: [
                if (totals != null)
                  AppSummaryCard(
                    stats: [
                      AppStat(label: 'Present', value: '${totals['present']}'),
                      AppStat(label: 'Absent', value: '${totals['absent']}'),
                      AppStat(label: 'On leave', value: '${totals['leave']}'),
                      AppStat(
                        label: 'Unmarked',
                        value: '${totals['unmarked']}',
                      ),
                    ],
                  ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.page,
                    AppSpacing.sm,
                    AppSpacing.page,
                    AppSpacing.sm,
                  ),
                  child: AppSearchField(
                    controller: _searchController,
                    hintText: 'Name',
                    onChanged: (value) => setState(() => _query = value),
                    textInputAction: TextInputAction.search,
                  ),
                ),
                if (rows.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: EmptyState(
                      icon: Icons.person_search_outlined,
                      title: 'No matches',
                      message: 'Try a different name.',
                    ),
                  )
                else
                  ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: rows.length,
                    separatorBuilder: (_, _) => const Divider(
                      height: 1,
                      indent: AppSpacing.page,
                      endIndent: AppSpacing.page,
                    ),
                    itemBuilder: (context, index) {
                      final r = rows[index];
                      final status = r['status'] as String?;
                      final approvedLeave = r['approvedLeave'] as String?;
                      final subtitleParts = [
                        r['employeeId'] as String?,
                        r['designation'] as String?,
                      ].whereType<String>().where((p) => p.isNotEmpty);

                      final tone = status != null
                          ? _toneForStatus(status)
                          : (approvedLeave != null ? Tone.info : Tone.neutral);

                      return AppListRow(
                        leading: AppAvatar(
                          name: r['name'] as String,
                          size: 40,
                          tone: tone,
                        ),
                        title: r['name'] as String,
                        subtitle: subtitleParts.join(' · '),
                        trailing: ToneBadge(
                          status ??
                              (approvedLeave != null
                                  ? 'Leave ($approvedLeave)'
                                  : 'Not marked'),
                          tone: tone,
                        ),
                      );
                    },
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}
