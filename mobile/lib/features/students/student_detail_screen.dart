import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../../models/student.dart';
import 'student_form_screen.dart';

final _studentDetailProvider = FutureProvider.family<Map<String, dynamic>, String>(
  (ref, studentId) async {
    final api = ref.watch(apiClientProvider);
    return api.get<Map<String, dynamic>>('/students/$studentId');
  },
);

Tone _toneForAttendance(int? percentBp) {
  if (percentBp == null) return Tone.neutral;
  if (percentBp >= 9000) return Tone.good;
  if (percentBp >= 7500) return Tone.warn;
  return Tone.bad;
}

/// Mirrors src/app/app/students/[id]/page.tsx: one child's full record —
/// contact, class/section, guardians — plus the two office-only actions
/// the web page and src/app/app/students/logins/actions.ts expose: correct
/// the record, and reset the child's own login.
class StudentDetailScreen extends ConsumerStatefulWidget {
  const StudentDetailScreen({super.key, required this.studentId});

  final String studentId;

  @override
  ConsumerState<StudentDetailScreen> createState() => _StudentDetailScreenState();
}

class _StudentDetailScreenState extends ConsumerState<StudentDetailScreen> {
  bool _busy = false;

  Future<void> _resetLogin() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reset this login?'),
        content: const Text(
          'This immediately invalidates the current password. The new one-time code is shown only once, '
          'right after this — write it down before leaving this screen.',
        ),
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
      final result = await api.post<Map<String, dynamic>>('/students/${widget.studentId}/reset-login');
      final slip = result['slip'] as Map<String, dynamic>;
      if (!mounted) return;
      await _showSlipDialog(title: 'New login code', slip: slip);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _showSlipDialog({required String title, required Map<String, dynamic> slip}) {
    return showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${slip['name']} · ${slip['email']}', style: const TextStyle(color: AppColors.ink3)),
            const SizedBox(height: 12),
            const Text('Write this down now — it will not be shown again.'),
            const SizedBox(height: 8),
            SelectableText(
              slip['code'] as String,
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 20, letterSpacing: 1),
            ),
          ],
        ),
        actions: [
          FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Done')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(_studentDetailProvider(widget.studentId));

    return Scaffold(
      appBar: AppTopBar(
        title: 'Student',
        actions: [
          detail.maybeWhen(
            data: (data) => AppIconButton(
              icon: Icons.edit_outlined,
              tooltip: 'Edit',
              onPressed: () async {
                final student = Student.fromJson(data['student'] as Map<String, dynamic>);
                final saved = await Navigator.of(context).push<bool>(
                  MaterialPageRoute(builder: (_) => StudentFormScreen(existing: student)),
                );
                if (saved == true) ref.invalidate(_studentDetailProvider(widget.studentId));
              },
            ),
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_studentDetailProvider(widget.studentId)),
        child: detail.when(
          loading: () => const AppDetailSkeleton(),
          error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_studentDetailProvider(widget.studentId))),
          data: (data) {
            final student = Student.fromJson(data['student'] as Map<String, dynamic>);
            final fees = data['fees'] as Map<String, dynamic>?;
            final attendance = data['attendance'] as Map<String, dynamic>?;
            final summary = attendance?['summary'] as Map<String, dynamic>?;
            final percentBp = summary?['percentBp'] as int?;
            final outstanding = (fees?['total'] as num?)?.toInt() ?? 0;
            final overdue = (fees?['overdue'] as num?)?.toInt() ?? 0;

            return ListView(
              padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.lg, AppSpacing.page, AppSpacing.xxl),
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    AppAvatar(name: student.name, size: 56, filled: true),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            student.name,
                            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20, letterSpacing: -0.4),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${student.admissionNumber} · ${student.className ?? '—'}'
                            '${student.sectionName != null ? ' ${student.sectionName}' : ''}',
                            style: const TextStyle(color: AppColors.ink3, fontWeight: FontWeight.w500),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    ToneBadge(
                      student.status == 'ACTIVE' ? 'On roll' : student.status,
                      tone: student.status == 'ACTIVE' ? Tone.good : Tone.neutral,
                    ),
                  ],
                ),
                if (fees != null || summary != null) ...[
                  const SizedBox(height: AppSpacing.xl),
                  AppSummaryCard(
                    margin: EdgeInsets.zero,
                    stats: [
                      if (fees != null)
                        AppStat(
                          label: 'Outstanding',
                          value: formatMoney(outstanding),
                          tone: outstanding > 0 ? Tone.warn : Tone.good,
                        ),
                      if (fees != null && overdue > 0)
                        AppStat(label: 'Overdue', value: formatMoney(overdue), tone: Tone.bad),
                      if (summary != null)
                        AppStat(
                          label: 'Attendance',
                          value: '${((percentBp ?? 0) / 100).toStringAsFixed(1)}%',
                          tone: _toneForAttendance(percentBp),
                        ),
                    ],
                  ),
                ],
                const SizedBox(height: AppSpacing.xl),
                SectionHeader('The child'),
                const SizedBox(height: AppSpacing.sm),
                AppKeyValueGroup(rows: [
                  AppKeyValue(label: 'Roll number', value: '${student.rollNumber ?? '—'}'),
                  AppKeyValue(label: 'Date of birth', value: student.dobIso != null ? formatDay(student.dobIso!) : '—'),
                  AppKeyValue(label: 'Gender', value: student.gender ?? '—'),
                  AppKeyValue(label: 'Blood group', value: student.bloodGroup ?? '—'),
                  AppKeyValue(label: 'Category', value: student.category ?? '—'),
                  AppKeyValue(
                    label: 'Admitted',
                    value: student.admissionDateIso != null ? formatDay(student.admissionDateIso!) : '—',
                  ),
                ]),
                const SizedBox(height: AppSpacing.lg),
                const SectionHeader('Guardians'),
                const SizedBox(height: AppSpacing.sm),
                AppKeyValueGroup(rows: [
                  AppKeyValue(label: "Father's name", value: student.fatherName ?? '—'),
                  AppKeyValue(label: "Mother's name", value: student.motherName ?? '—'),
                  AppKeyValue(label: 'Mobile', value: student.guardianPhone ?? '—'),
                  AppKeyValue(label: 'Email', value: student.guardianEmail ?? '—'),
                  AppKeyValue(label: 'Address', value: student.address ?? '—'),
                ]),
                const SizedBox(height: AppSpacing.xl),
                if (student.hasLogin)
                  OutlinedButton.icon(
                    onPressed: _busy ? null : _resetLogin,
                    icon: const Icon(Icons.lock_reset_outlined),
                    label: const Text('Reset login'),
                  )
                else
                  const AppBanner(
                    tone: Tone.neutral,
                    icon: Icons.info_outline_rounded,
                    message: 'This child has no login yet — issue one from Student logins on the directory screen.',
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}
