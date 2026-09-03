import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

final myStaffAttendanceProvider = FutureProvider((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/attendance/staff/me');
});

const _statusOptions = [
  ('PRESENT', 'Present', Icons.check_circle_outlined, Tone.good),
  ('LATE', 'Late', Icons.schedule_outlined, Tone.warn),
  ('LEAVE', 'On leave', Icons.beach_access_outlined, Tone.info),
  ('ABSENT', 'Absent', Icons.cancel_outlined, Tone.bad),
];

Tone _toneForStatus(String status) => switch (status) {
      'PRESENT' => Tone.good,
      'LATE' => Tone.warn,
      'LEAVE' => Tone.info,
      'ABSENT' => Tone.bad,
      _ => Tone.neutral,
    };

/// A teacher/staff member marking their OWN attendance for today — self
/// check-in, distinct from the office bulk-marking every staff member's
/// attendance on their behalf (attendance_register/staff_attendance screens).
class StaffSelfAttendanceScreen extends ConsumerStatefulWidget {
  const StaffSelfAttendanceScreen({super.key});

  @override
  ConsumerState<StaffSelfAttendanceScreen> createState() => _StaffSelfAttendanceScreenState();
}

class _StaffSelfAttendanceScreenState extends ConsumerState<StaffSelfAttendanceScreen> {
  bool _saving = false;

  Future<void> _mark(String status) async {
    setState(() => _saving = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.post('/attendance/staff/me', data: {'status': status});
      ref.invalidate(myStaffAttendanceProvider);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final result = ref.watch(myStaffAttendanceProvider);

    return Scaffold(
      appBar: AppTopBar(title: 'My attendance'),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(myStaffAttendanceProvider),
        child: result.when(
          loading: () => const AppCardsSkeleton(),
          error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(myStaffAttendanceProvider)),
          data: (data) {
            final today = data['today'] as Map<String, dynamic>;
            final todayStatus = today['status'] as String?;
            final summary = data['summary'] as Map<String, dynamic>?;
            final recent = (data['recent'] as List? ?? []).cast<Map<String, dynamic>>();

            return ListView(
              padding: const EdgeInsets.all(AppSpacing.ml),
              children: [
                AppSurface(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Eyebrow('Today'),
                        const SizedBox(height: 6),
                        if (todayStatus != null)
                          Row(
                            children: [
                              Icon(Icons.check_circle, color: toneColor(_toneForStatus(todayStatus)), size: 22),
                              const SizedBox(width: 8),
                              Text(
                                'Marked $todayStatus',
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 16,
                                  color: toneColor(_toneForStatus(todayStatus)),
                                ),
                              ),
                            ],
                          )
                        else
                          const Text("You haven't marked today yet.", style: TextStyle(color: AppColors.ink2, fontSize: 14)),
                        const SizedBox(height: 16),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final opt in _statusOptions)
                              _StatusButton(
                                label: opt.$2,
                                icon: opt.$3,
                                tone: opt.$4,
                                selected: todayStatus == opt.$1,
                                enabled: !_saving,
                                onTap: () => _mark(opt.$1),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                if (summary != null) ...[
                  const SizedBox(height: 12),
                  AppSummaryCard(
                    margin: EdgeInsets.zero,
                    stats: [
                      AppStat(label: 'Present', value: '${summary['presentDays'] ?? 0}'),
                      AppStat(label: 'Absent', value: '${summary['absentDays'] ?? 0}'),
                      AppStat(label: 'Late', value: '${summary['lateDays'] ?? 0}'),
                    ],
                  ),
                ],
                if (recent.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  const SectionHeader('Last 30 days'),
                  const SizedBox(height: AppSpacing.sm),
                  AppSurface(
                    clip: true,
                    child: Column(
                      children: [
                        for (var i = 0; i < recent.length; i++) ...[
                          AppListRow(
                            title: formatDay(recent[i]['date'] as String),
                            trailing: ToneBadge(
                              recent[i]['status'] as String,
                              tone: _toneForStatus(recent[i]['status'] as String),
                            ),
                          ),
                          if (i < recent.length - 1)
                            const Divider(height: 1, indent: AppSpacing.lg, endIndent: AppSpacing.lg),
                        ],
                      ],
                    ),
                  ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _StatusButton extends StatelessWidget {
  const _StatusButton({
    required this.label,
    required this.icon,
    required this.tone,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final Tone tone;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(10);

    return AppPressable(
      onTap: enabled ? onTap : null,
      borderRadius: radius,
      child: Container(
        decoration: BoxDecoration(color: selected ? toneColor(tone) : toneBackground(tone), borderRadius: radius),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: selected ? Colors.white : toneColor(tone)),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 13,
                color: selected ? Colors.white : toneColor(tone),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
