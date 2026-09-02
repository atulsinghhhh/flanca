import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'attendance_mark_screen.dart';
import 'attendance_register_screen.dart';
import 'attendance_shortage_screen.dart';

final attendanceStatusProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/attendance/status');
});

/// Mirrors src/app/app/attendance/page.tsx: which sections are marked for
/// today, and which still need it.
class AttendanceStatusScreen extends ConsumerWidget {
  const AttendanceStatusScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(attendanceStatusProvider);
    final isTeaching = ref.watch(authControllerProvider).actor?.isTeaching ?? false;

    return Scaffold(
      appBar: AppTopBar(
        title: 'Attendance',
        actions: isTeaching
            ? [
                AppIconButton(
                  tooltip: 'Attendance shortage',
                  icon: Icons.warning_amber_rounded,
                  tone: Tone.warn,
                  onPressed: () =>
                      Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AttendanceShortageScreen())),
                ),
                const SizedBox(width: AppSpacing.sm),
                AppIconButton(
                  tooltip: 'Attendance register',
                  icon: Icons.grid_view_outlined,
                  onPressed: () =>
                      Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AttendanceRegisterPickerScreen())),
                ),
              ]
            : const [],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(attendanceStatusProvider),
        color: AppColors.brand,
        backgroundColor: AppColors.card,
        child: status.when(
          loading: () => const AppListSkeleton(),
          error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(attendanceStatusProvider)),
          data: (data) {
            final rows = (data['rows'] as List).cast<Map<String, dynamic>>();
            if (rows.isEmpty) {
              return const EmptyState(
                icon: Icons.fact_check_outlined,
                tone: Tone.good,
                title: 'Nothing to mark',
                message: 'Attendance for all your sections is already in.',
              );
            }

            final pending = rows.where((r) => r['isComplete'] != true).length;

            return ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                AppSpacing.md,
                AppSpacing.page,
                AppSpacing.xxl,
              ),
              // One extra leading item: the "how much is left" line, which
              // otherwise had to be counted off the badges by eye.
              itemCount: rows.length + 1,
              separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
              itemBuilder: (context, index) {
                if (index == 0) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                    child: AppStatChip(
                      label: pending == 0
                          ? 'All sections marked'
                          : '$pending section${pending == 1 ? '' : 's'} still to mark',
                      icon: pending == 0 ? Icons.check_circle_outlined : Icons.pending_outlined,
                      tone: pending == 0 ? Tone.good : Tone.warn,
                    ),
                  );
                }
                return AppFadeIn(
                  delay: AppFadeIn.stagger(index - 1),
                  child: _SectionRow(row: rows[index - 1]),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

/// One section's state for today, as its own panel.
///
/// The four numbers used to be crammed into a single subtitle string. Now the
/// marked-of-strength count is the headline figure, a progress rule under it
/// carries "how far along", and present/absent sit beneath as detail — so the
/// list can be triaged without reading a sentence per row.
class _SectionRow extends StatelessWidget {
  const _SectionRow({required this.row});

  final Map<String, dynamic> row;

  @override
  Widget build(BuildContext context) {
    final isComplete = row['isComplete'] as bool;
    final strength = row['strength'] as int;
    final marked = row['marked'] as int? ?? 0;
    final label = row['label'] as String;
    final empty = strength == 0;
    final progress = empty ? 0.0 : (marked / strength).clamp(0.0, 1.0);
    final tone = isComplete ? Tone.good : Tone.warn;

    return AppSurface(
      padding: const EdgeInsets.all(AppSpacing.lg),
      onTap: empty
          ? null
          : () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => AttendanceMarkScreen(
                    sectionId: row['sectionId'] as String,
                    sectionLabel: label,
                  ),
                ),
              ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: toneBackground(tone),
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                ),
                child: Icon(
                  isComplete ? Icons.check_rounded : Icons.edit_outlined,
                  size: 19,
                  color: toneColor(tone),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5, letterSpacing: -0.25),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              ToneBadge(isComplete ? 'Done' : 'Pending', tone: tone),
            ],
          ),
          if (empty)
            const Padding(
              padding: EdgeInsets.only(top: AppSpacing.md),
              child: Text('No students on roll', style: TextStyle(color: AppColors.ink3, fontSize: 13)),
            )
          else ...[
            const SizedBox(height: AppSpacing.lg),
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(
                  '$marked',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.7,
                    height: 1,
                    color: toneColor(tone),
                  ),
                ),
                Text(
                  ' / $strength marked',
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.ink3,
                    fontWeight: FontWeight.w600,
                    height: 1.3,
                  ),
                ),
                const Spacer(),
                Text(
                  '${row['present']} present · ${row['absent']} absent',
                  style: const TextStyle(color: AppColors.ink3, fontSize: 12.5),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            ClipRRect(
              borderRadius: BorderRadius.circular(AppRadius.pill),
              child: TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: progress),
                duration: AppMotion.slow,
                curve: AppMotion.curve,
                builder: (context, value, _) => LinearProgressIndicator(
                  value: value,
                  minHeight: 6,
                  backgroundColor: AppColors.paper2,
                  valueColor: AlwaysStoppedAnimation(toneColor(tone)),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
