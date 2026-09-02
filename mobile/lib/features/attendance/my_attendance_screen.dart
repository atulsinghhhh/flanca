import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../profile/student_profile_screen.dart' show studentProfileProvider;

/// A student/parent's OWN attendance record — /students/me already carries
/// the full summary (percent, present/absent/late/leave days, eligibility,
/// absence streak, a recent daily log), computed the same way
/// src/app/app/attendance/shortage's per-student verdict is. The Home
/// dashboard's "Attendance" quick action used to send every role into
/// AttendanceStatusScreen, which only a teacher/office account can use
/// (backend TEACHING-only) — this is the non-teaching branch of that card.
class MyAttendanceScreen extends ConsumerWidget {
  const MyAttendanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(studentProfileProvider);

    return Scaffold(
      appBar: const AppTopBar(title: 'Attendance'),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(studentProfileProvider),
        color: AppColors.brand,
        backgroundColor: AppColors.card,
        child: result.when(
          loading: () => const AppCardsSkeleton(),
          error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(studentProfileProvider)),
          data: (data) {
            final children = data['children'] as List?;
            final profiles = children != null ? children.cast<Map<String, dynamic>>() : [data];

            return ListView(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                AppSpacing.md,
                AppSpacing.page,
                AppSpacing.xxl,
              ),
              children: [
                for (final profile in profiles)
                  _ChildAttendance(profile: profile, showName: profiles.length > 1),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _ChildAttendance extends StatelessWidget {
  const _ChildAttendance({required this.profile, required this.showName});

  final Map<String, dynamic> profile;
  final bool showName;

  @override
  Widget build(BuildContext context) {
    final student = profile['student'] as Map<String, dynamic>?;
    final attendance = profile['attendance'] as Map<String, dynamic>?;
    if (student == null || attendance == null) return const SizedBox.shrink();

    final summary = attendance['summary'] as Map<String, dynamic>;
    final eligibility = attendance['eligibility'] as Map<String, dynamic>;
    final streak = attendance['streak'] as int? ?? 0;
    final recent = (attendance['recent'] as List? ?? []).cast<Map<String, dynamic>>();
    final percentBp = summary['percentBp'] as int;
    final unreachable = eligibility['unreachable'] as bool? ?? false;
    final isShort = eligibility['isShort'] as bool? ?? false;

    final tone = unreachable ? Tone.bad : (isShort ? Tone.warn : Tone.good);
    final shown = recent.length.clamp(0, 10);

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (showName) ...[
            SectionHeader(student['name'] as String? ?? 'Student'),
            const SizedBox(height: AppSpacing.md),
          ],
          // The percentage was a number in a corner; it is now a dial, which
          // is what makes "am I near the line" readable without doing the
          // arithmetic against the requirement.
          AppSurface(
            padding: const EdgeInsets.all(AppSpacing.ml),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _PercentDial(percentBp: percentBp, tone: tone),
                    const SizedBox(width: AppSpacing.ml),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          ToneBadge(
                            unreachable ? 'Below requirement' : (isShort ? 'Watch closely' : 'On track'),
                            tone: tone,
                          ),
                          const SizedBox(height: AppSpacing.sm + 2),
                          Text(
                            '${summary['presentDays']}/${summary['workingDays']} working days present',
                            style: const TextStyle(color: AppColors.ink2, fontSize: 13, height: 1.4),
                          ),
                          if (streak >= 2)
                            Padding(
                              padding: const EdgeInsets.only(top: 6),
                              child: Text(
                                '$streak days absent in a row',
                                style: const TextStyle(
                                  color: AppColors.overdue,
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          // These three counts used to be a hand-rolled copy of
          // AppSummaryCard's own dot/label/figure layout (down to the same
          // divider); using the real component instead of the private
          // _Stat/_StatDivider pair keeps this "numbers the screen opens
          // with" row identical to the metric band on every other summary
          // screen.
          const SizedBox(height: AppSpacing.md),
          AppSummaryCard(
            margin: EdgeInsets.zero,
            stats: [
              AppStat(label: 'Absent', value: '${summary['absentDays']}', tone: Tone.bad),
              AppStat(label: 'Late', value: '${summary['lateDays']}', tone: Tone.warn),
              AppStat(label: 'Leave', value: '${summary['leaveDays']}', tone: Tone.info),
            ],
          ),
          if (recent.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xl),
            const SectionHeader('Recent days'),
            const SizedBox(height: AppSpacing.md),
            AppSurface(
              clip: true,
              child: Column(
                children: [
                  for (var i = 0; i < shown; i++) ...[
                    _DayRow(day: recent[i]),
                    if (i < shown - 1)
                      const Divider(height: 1, indent: AppSpacing.lg, endIndent: AppSpacing.lg),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// The attendance percentage as an animated ring. The sweep runs once, on
/// arrival, at the same 360ms everything else in the app moves at — long
/// enough to read as a fill, short enough not to be waited on.
class _PercentDial extends StatelessWidget {
  const _PercentDial({required this.percentBp, required this.tone});

  final int percentBp;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final fraction = (percentBp / 10000).clamp(0.0, 1.0);
    final color = toneColor(tone);

    return SizedBox(
      width: 92,
      height: 92,
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: fraction),
        duration: AppMotion.slow,
        curve: AppMotion.curve,
        builder: (context, value, _) => Stack(
          alignment: Alignment.center,
          children: [
            SizedBox.expand(
              child: CircularProgressIndicator(
                value: value,
                strokeWidth: 8,
                strokeCap: StrokeCap.round,
                backgroundColor: toneBackground(tone),
                valueColor: AlwaysStoppedAnimation(color),
              ),
            ),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
                child: Text(
                  '${(percentBp / 100).toStringAsFixed(1)}%',
                  style: TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.8,
                    height: 1,
                    color: color,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Tone _toneForDayStatus(String status) => switch (status) {
      'PRESENT' => Tone.good,
      'ABSENT' => Tone.bad,
      'LATE' => Tone.warn,
      'LEAVE' => Tone.info,
      _ => Tone.neutral,
    };

IconData _iconForDayStatus(String status) => switch (status) {
      'PRESENT' => Icons.check_rounded,
      'ABSENT' => Icons.close_rounded,
      'LATE' => Icons.schedule_outlined,
      'LEAVE' => Icons.flight_takeoff_outlined,
      _ => Icons.remove_rounded,
    };

class _DayRow extends StatelessWidget {
  const _DayRow({required this.day});

  final Map<String, dynamic> day;

  @override
  Widget build(BuildContext context) {
    final status = day['status'] as String? ?? '';
    final date = day['date'] as String?;
    final tone = _toneForDayStatus(status);

    return AppListRow(
      // A tinted status glyph rather than a bare date row: the log is read
      // as a run of marks, and the glyph column is what makes a bad week
      // visible at a glance.
      leading: Container(
        width: 30,
        height: 30,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: toneBackground(tone),
          borderRadius: BorderRadius.circular(AppRadius.xs),
        ),
        child: Icon(_iconForDayStatus(status), size: 16, color: toneColor(tone)),
      ),
      title: date != null ? formatDay(date) : '',
      trailing: ToneBadge(status, tone: tone, dot: false),
    );
  }
}
