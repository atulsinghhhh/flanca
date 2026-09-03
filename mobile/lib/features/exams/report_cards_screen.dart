import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

final reportCardsProvider = FutureProvider((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/report-cards/me');
});

/// Mirrors src/app/app/report-cards/page.tsx's read side — a student/parent
/// viewing published report cards. Generation/remarks stay office/teaching work.
class ReportCardsScreen extends ConsumerWidget {
  const ReportCardsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(reportCardsProvider);

    return Scaffold(
      appBar: AppTopBar(title: 'Report cards'),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(reportCardsProvider),
        child: result.when(
          loading: () => const AppCardsSkeleton(),
          error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(reportCardsProvider)),
          data: (data) {
            final children = data['children'] as List?;
            final groups = children != null
                ? children.cast<Map<String, dynamic>>()
                : [
                    {'studentName': null, 'reportCards': data['reportCards']},
                  ];

            final allEmpty = groups.every((g) => (g['reportCards'] as List? ?? []).isEmpty);
            if (allEmpty) {
              return const EmptyState(icon: Icons.school_outlined, title: 'No report cards', message: 'Report cards appear here once they are published.');
            }

            return ListView(
              padding: const EdgeInsets.all(AppSpacing.ml),
              children: [
                for (final group in groups) ...[
                  if (group['studentName'] != null) ...[
                    SectionHeader(group['studentName'] as String),
                    const SizedBox(height: AppSpacing.sm),
                  ],
                  for (final card in (group['reportCards'] as List? ?? []).cast<Map<String, dynamic>>())
                    _ReportCardTile(card: card),
                  const SizedBox(height: 12),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _ReportCardTile extends StatelessWidget {
  const _ReportCardTile({required this.card});

  final Map<String, dynamic> card;

  @override
  Widget build(BuildContext context) {
    final percentage = card['percentage'];
    final grade = card['grade'] as String?;
    final termName = (card['examTerm'] as Map?)?['name'] as String? ?? 'Term';
    final className = (card['class'] as Map?)?['name'] as String? ?? '';
    final sectionName = (card['section'] as Map?)?['name'] as String? ?? '';

    return AppSurface(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      child: AppListRow(
        icon: Icons.school_outlined,
        tone: Tone.info,
        title: termName,
        subtitle: '$className $sectionName'.trim(),
        // The percentage is the reason anyone opens a report card, so it gets
        // display weight on the right rather than a line of body text.
        trailing: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (percentage != null)
              Text(
                '${((percentage as num) / 100).toStringAsFixed(1)}%',
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, letterSpacing: -0.5),
              ),
            if (grade != null) ...[
              const SizedBox(height: 4),
              ToneBadge(grade, tone: Tone.info, dot: false),
            ],
          ],
        ),
      ),
    );
  }
}
