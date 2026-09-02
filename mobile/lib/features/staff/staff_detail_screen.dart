import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

final _staffDetailProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, String>(
  (ref, staffId) async {
    final api = ref.watch(apiClientProvider);
    return api.get<Map<String, dynamic>>('/staff/$staffId');
  },
);

/// Mirrors src/app/app/staff/[id]: one staff member's contact/HR record,
/// attendance summary, subjects/timetable load, salary history, and the two
/// office-only actions — reset password and active/inactive toggle.
class StaffDetailScreen extends ConsumerStatefulWidget {
  const StaffDetailScreen({super.key, required this.staffId});

  final String staffId;

  @override
  ConsumerState<StaffDetailScreen> createState() => _StaffDetailScreenState();
}

class _StaffDetailScreenState extends ConsumerState<StaffDetailScreen> {
  bool _busy = false;

  Future<void> _resetPassword() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reset password?'),
        content: const Text('This immediately invalidates the current password. The new one-time password is shown '
            'only once, right after this.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Reset')),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _busy = true);
    try {
      final api = ref.read(apiClientProvider);
      final result = await api.post<Map<String, dynamic>>('/staff/${widget.staffId}/reset-password');
      final firstPassword = result['firstPassword'] as String;
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (context) => AlertDialog(
          title: const Text('New password'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Share this with the staff member now — it will not be shown again.'),
              const SizedBox(height: 12),
              SelectableText(
                firstPassword,
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18, letterSpacing: 0.5),
              ),
            ],
          ),
          actions: [
            FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Done')),
          ],
        ),
      );
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _setActive(bool isActive) async {
    setState(() => _busy = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.post('/staff/${widget.staffId}/active', data: {'isActive': isActive});
      ref.invalidate(_staffDetailProvider(widget.staffId));
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(_staffDetailProvider(widget.staffId));

    return Scaffold(
      appBar: AppTopBar(title: 'Staff'),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_staffDetailProvider(widget.staffId)),
        child: detail.when(
          loading: () => const AppDetailSkeleton(),
          error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_staffDetailProvider(widget.staffId))),
          data: (data) {
            final isActive = data['isActive'] as bool? ?? true;
            final attendance = data['attendance'] as Map<String, dynamic>?;
            final subjects = (data['subjects'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
            final salaries = (data['salaries'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
            final joiningDate = data['joiningDate'] as String?;
            final dob = data['dob'] as String?;
            final basicPay = data['basicPay'] as int? ?? 0;
            final advanceOutstanding = data['advanceOutstanding'] as int? ?? 0;
            final attendancePercentBp = attendance?['percentBp'] as int?;

            return ListView(
              padding: const EdgeInsets.fromLTRB(AppSpacing.page, 16, AppSpacing.page, 32),
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(data['name'] as String,
                              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 20)),
                          const SizedBox(height: 2),
                          Text(
                            [data['designation'], data['department']].whereType<String>().join(' · '),
                            style: const TextStyle(color: AppColors.ink3),
                          ),
                        ],
                      ),
                    ),
                    ToneBadge(isActive ? 'Active' : 'Inactive', tone: isActive ? Tone.good : Tone.bad),
                  ],
                ),
                const SizedBox(height: AppSpacing.xl),
                AppSummaryCard(
                  margin: EdgeInsets.zero,
                  stats: [
                    AppStat(label: 'Basic pay', value: formatMoney(basicPay)),
                    AppStat(
                      label: 'Advance due',
                      value: formatMoney(advanceOutstanding),
                      tone: advanceOutstanding > 0 ? Tone.warn : null,
                    ),
                    if (attendance != null)
                      AppStat(
                        label: 'Attendance',
                        value: '${((attendancePercentBp ?? 0) / 100).toStringAsFixed(1)}%',
                      ),
                  ],
                ),
                const SizedBox(height: AppSpacing.xl),
                const SectionHeader('Contact'),
                const SizedBox(height: AppSpacing.sm),
                AppKeyValueGroup(rows: [
                  AppKeyValue(label: 'Employee ID', value: data['employeeId'] as String? ?? '—'),
                  AppKeyValue(label: 'Email', value: data['email'] as String? ?? '—'),
                  AppKeyValue(label: 'Phone', value: data['phone'] as String? ?? '—'),
                  if (data['qualification'] != null)
                    AppKeyValue(label: 'Qualification', value: data['qualification'] as String),
                  if (joiningDate != null) AppKeyValue(label: 'Joined', value: formatDay(joiningDate)),
                  if (dob != null) AppKeyValue(label: 'Date of birth', value: formatDay(dob)),
                  if (data['gender'] != null) AppKeyValue(label: 'Gender', value: data['gender'] as String),
                ]),
                if (attendance != null) ...[
                  const SizedBox(height: AppSpacing.lg),
                  const SectionHeader('Attendance (this month)'),
                  const SizedBox(height: AppSpacing.sm),
                  AppKeyValueGroup(rows: [
                    AppKeyValue(
                      label: 'Present',
                      value: '${((attendancePercentBp ?? 0) / 100).toStringAsFixed(1)}% '
                          '(${attendance['workingDays']} working days)',
                    ),
                    if (attendance['presentDays'] != null)
                      AppKeyValue(
                        label: 'Breakdown',
                        value: '${attendance['presentDays']} present · ${attendance['absentDays']} absent · '
                            '${attendance['leaveDays']} leave · ${attendance['lateDays']} late',
                      ),
                  ]),
                ],
                if (subjects.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  AppSurface(
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.ml),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const SectionHeader('Subjects'),
                          const SizedBox(height: AppSpacing.sm),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: subjects
                                .map((s) => Chip(label: Text('${s['name']} · ${s['className']}')))
                                .toList(),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
                if (salaries.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  AppSurface(
                    clip: true,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(AppSpacing.page, 16, AppSpacing.page, 8),
                          child: Eyebrow('Salary history'),
                        ),
                        ...salaries.map((sal) {
                          final paidAt = sal['paidAt'] as String?;
                          return AppListRow(
                            title: '${_monthName(sal['month'] as int)} ${sal['year']}',
                            subtitle: paidAt != null ? 'Paid ${formatDay(paidAt)} · ${sal['mode'] ?? ''}' : 'Unpaid',
                            trailing: Text(
                              formatMoney(sal['netPay'] as int? ?? 0),
                              style: const TextStyle(fontWeight: FontWeight.w700),
                            ),
                          );
                        }),
                        const SizedBox(height: 8),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                OutlinedButton.icon(
                  onPressed: _busy ? null : _resetPassword,
                  icon: const Icon(Icons.lock_reset_outlined),
                  label: const Text('Reset password'),
                ),
                const SizedBox(height: 12),
                AppTileGroup(
                  tiles: [
                    AppTileSpec(
                      Icons.toggle_on_outlined,
                      'Active',
                      _busy ? () {} : () => _setActive(!isActive),
                      subtitle: isActive ? 'Can sign in and appears on rosters.' : 'Sign-in disabled.',
                      trailing: Switch(
                        value: isActive,
                        onChanged: _busy ? null : _setActive,
                      ),
                    ),
                  ],
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

String _monthName(int month) {
  const names = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return names[(month - 1).clamp(0, 11)];
}
