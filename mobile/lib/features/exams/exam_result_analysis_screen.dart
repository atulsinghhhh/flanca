import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

final _analysisProvider = FutureProvider.family<Map<String, dynamic>, String>(
  (ref, termId) async {
    final api = ref.watch(apiClientProvider);
    return api.get<Map<String, dynamic>>('/exams/analysis/$termId');
  },
);

/// Mirrors src/app/app/report-cards/page.tsx's class result analysis — how
/// the class did, not the generate-a-card action (that stays office bulk
/// work). A class teacher's "how did my class do" view, read-only.
class ExamResultAnalysisScreen extends ConsumerWidget {
  const ExamResultAnalysisScreen({super.key, required this.termId, required this.className});

  final String termId;
  final String className;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(_analysisProvider(termId));

    return Scaffold(
      appBar: AppTopBar(title: '$className results'),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_analysisProvider(termId)),
        child: result.when(
          loading: () => const AppCardsSkeleton(),
          error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_analysisProvider(termId))),
          data: (data) {
            final strength = data['strength'] as int;
            final entered = data['entered'] as int;
            if (entered == 0) {
              return const EmptyState(icon: Icons.bar_chart_outlined, title: 'No results yet', message: 'Marks appear here once teachers enter them.');
            }
            final passed = data['passed'] as int;
            final failed = data['failed'] as int;
            final classAverageBp = data['classAverageBp'] as int;
            final subjects = (data['subjects'] as List).cast<Map<String, dynamic>>();
            final toppers = (data['toppers'] as List).cast<Map<String, dynamic>>();

            return ListView(
              padding: const EdgeInsets.all(AppSpacing.ml),
              children: [
                AppSummaryCard(
                  margin: EdgeInsets.zero,
                  stats: [
                    AppStat(label: 'Entered', value: '$entered/$strength'),
                    AppStat(label: 'Class average', value: '${(classAverageBp / 100).toStringAsFixed(1)}%'),
                    AppStat(label: 'Passed', value: '$passed'),
                    if (failed > 0) AppStat(label: 'Failed', value: '$failed'),
                  ],
                ),
                const SizedBox(height: 20),
                if (toppers.isNotEmpty) ...[
                  const SectionHeader('Toppers'),
                  const SizedBox(height: AppSpacing.sm),
                  AppSurface(
                    clip: true,
                    child: Column(
                      children: [
                        for (var i = 0; i < toppers.length; i++) ...[
                          AppListRow(
                            // Rank as a numbered medallion, gold for the top
                            // three — a leaderboard should look like one.
                            leading: Container(
                              width: 36,
                              height: 36,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: i < 3 ? AppColors.marigoldLight : AppColors.paper2,
                                shape: BoxShape.circle,
                              ),
                              child: Text(
                                '${i + 1}',
                                style: TextStyle(
                                  color: i < 3 ? AppColors.marigold : AppColors.ink3,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 13,
                                  height: 1,
                                ),
                              ),
                            ),
                            title: toppers[i]['name'] as String? ?? '',
                            trailing: Text(
                              '${(((toppers[i]['totals'] as Map)['percentBp'] as int) / 100).toStringAsFixed(1)}%',
                              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, letterSpacing: -0.3),
                            ),
                          ),
                          if (i < toppers.length - 1)
                            const Divider(height: 1, indent: AppTile.dividerIndent, endIndent: AppSpacing.lg),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                ],
                if (subjects.isNotEmpty) ...[
                  const SectionHeader('By subject'),
                  const SizedBox(height: AppSpacing.sm),
                  AppSurface(
                    clip: true,
                    child: Column(
                      children: [
                        for (var i = 0; i < subjects.length; i++) ...[
                          _SubjectRow(subject: subjects[i]),
                          if (i < subjects.length - 1) const Divider(height: 1, indent: 16, endIndent: 16),
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

class _SubjectRow extends StatelessWidget {
  const _SubjectRow({required this.subject});

  final Map<String, dynamic> subject;

  @override
  Widget build(BuildContext context) {
    final passRateBp = subject['passRateBp'] as int;
    final lowPassRate = passRateBp < 5000;

    return AppListRow(
      icon: Icons.menu_book_outlined,
      tone: lowPassRate ? Tone.bad : Tone.good,
      title: subject['subject'] as String,
      subtitle: 'Average ${(subject['averageBp'] as int) ~/ 100}% · Highest ${subject['highest']}',
      trailing: ToneBadge('${passRateBp ~/ 100}% passed', tone: lowPassRate ? Tone.bad : Tone.good),
    );
  }
}
