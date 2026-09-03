import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'exam_result_analysis_screen.dart';

/// Report cards are class-teacher-only — narrower than the exam-cycle list,
/// which also includes classes a subject-only teacher merely teaches one
/// paper in. Deliberately NOT sharing examTermsProvider/`/exams/terms`: that
/// list is correct for marks entry but would leak subject-teacher classes
/// into this screen too.
final _reportCardTermsProvider = FutureProvider((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/report-cards/terms');
});

final _termClassesProvider = FutureProvider.family<Map<String, dynamic>, String>(
  (ref, termName) async {
    final api = ref.watch(apiClientProvider);
    return api.get<Map<String, dynamic>>('/report-cards/terms/${Uri.encodeComponent(termName)}');
  },
);

/// Mirrors src/app/app/report-cards/page.tsx's own entry point — a
/// staff-facing "pick a cycle, see how the class did" path, distinct from
/// ReportCardsScreen (the student/parent read of their own published cards)
/// and from ExamTermsScreen (marks entry). Same underlying data as the exams
/// flow's per-class "Results" button, just reachable without going through
/// marks entry first.
class ReportCardTermsScreen extends ConsumerWidget {
  const ReportCardTermsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(_reportCardTermsProvider);

    return Scaffold(
      appBar: AppTopBar(title: 'Report cards'),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_reportCardTermsProvider),
        child: result.when(
          loading: () => const AppListSkeleton(),
          error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_reportCardTermsProvider)),
          data: (data) {
            final terms = (data['terms'] as List).cast<Map<String, dynamic>>();
            if (terms.isEmpty) {
              return const EmptyState(icon: Icons.school_outlined, title: 'No exam cycles', message: 'Report cards appear here once an exam cycle exists.');
            }
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                AppSpacing.md,
                AppSpacing.page,
                AppSpacing.xxl,
              ),
              itemCount: terms.length,
              separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
              itemBuilder: (context, index) {
                final term = terms[index];
                final published = term['isPublished'] == true;

                return AppFadeIn(
                  delay: AppFadeIn.stagger(index),
                  child: AppListRow(
                    icon: Icons.school_outlined,
                    tone: published ? Tone.good : Tone.warn,
                    title: term['name'] as String,
                    subtitle: '${term['classCount']} classes · ${term['examCount']} exams',
                    trailing: ToneBadge(published ? 'Published' : 'Draft', tone: published ? Tone.good : Tone.warn),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => ReportCardClassesScreen(termName: term['name'] as String)),
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

/// The classes within one exam cycle — tapping a class jumps straight to its
/// result analysis, skipping the marks-entry list ExamTermDetailScreen shows.
class ReportCardClassesScreen extends ConsumerWidget {
  const ReportCardClassesScreen({super.key, required this.termName});

  final String termName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(_termClassesProvider(termName));

    return Scaffold(
      appBar: AppTopBar(title: termName),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_termClassesProvider(termName)),
        child: result.when(
          loading: () => const AppListSkeleton(),
          error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_termClassesProvider(termName))),
          data: (data) {
            final term = data['term'] as Map<String, dynamic>;
            final classes = (term['classes'] as List).cast<Map<String, dynamic>>();
            if (classes.isEmpty) {
              return const EmptyState(icon: Icons.school_outlined, title: 'No classes', message: 'This exam cycle has no classes attached yet.');
            }
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                AppSpacing.md,
                AppSpacing.page,
                AppSpacing.xxl,
              ),
              itemCount: classes.length,
              separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
              itemBuilder: (context, index) {
                final cls = classes[index];
                return AppFadeIn(
                  delay: AppFadeIn.stagger(index),
                  child: AppListRow(
                    icon: Icons.groups_outlined,
                    tone: Tone.brand,
                    title: cls['className'] as String,
                    subtitle: '${cls['strength']} students',
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => ExamResultAnalysisScreen(
                          termId: cls['termId'] as String,
                          className: cls['className'] as String,
                        ),
                      ),
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
