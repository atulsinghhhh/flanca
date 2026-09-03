import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'exam_marks_entry_screen.dart';
import 'exam_result_analysis_screen.dart';

final _termDetailProvider = FutureProvider.family<Map<String, dynamic>, String>(
  (ref, termName) async {
    final api = ref.watch(apiClientProvider);
    return api.get<Map<String, dynamic>>('/exams/terms/${Uri.encodeComponent(termName)}');
  },
);

/// Mirrors src/app/app/exams/term/[name]/page.tsx: every class's papers for
/// this cycle, with entry progress, so a teacher sees exactly what is left
/// to mark and can jump straight into a paper.
class ExamTermDetailScreen extends ConsumerWidget {
  const ExamTermDetailScreen({super.key, required this.termName});

  final String termName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(_termDetailProvider(termName));

    return Scaffold(
      appBar: AppTopBar(title: termName),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_termDetailProvider(termName)),
        child: result.when(
          loading: () => const AppListSkeleton(),
          error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_termDetailProvider(termName))),
          data: (data) {
            final term = data['term'] as Map<String, dynamic>;
            final classes = (term['classes'] as List).cast<Map<String, dynamic>>();
            if (classes.isEmpty) {
              return const EmptyState(icon: Icons.school_outlined, title: 'No classes', message: 'This exam cycle has no classes attached yet.');
            }
            return ListView(
              padding: const EdgeInsets.fromLTRB(AppSpacing.page, 12, AppSpacing.page, 24),
              children: [
                for (final cls in classes) _ClassCard(cls: cls),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _ClassCard extends StatelessWidget {
  const _ClassCard({required this.cls});

  final Map<String, dynamic> cls;

  @override
  Widget build(BuildContext context) {
    final exams = (cls['exams'] as List).cast<Map<String, dynamic>>();

    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionHeader(
            cls['className'] as String,
            padding: const EdgeInsets.only(left: 4, bottom: 8, top: 12),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('${cls['strength']} students', style: const TextStyle(color: AppColors.ink3, fontSize: 12.5)),
                if (exams.isNotEmpty)
                  TextButton(
                    style: TextButton.styleFrom(padding: const EdgeInsets.only(left: 8), minimumSize: Size.zero),
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => ExamResultAnalysisScreen(
                          termId: cls['termId'] as String,
                          className: cls['className'] as String,
                        ),
                      ),
                    ),
                    child: const Text('Results'),
                  ),
              ],
            ),
          ),
          AppSurface(
            clip: true,
            child: Column(
              children: [
                if (exams.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    child: Text('No papers scheduled.', style: TextStyle(color: AppColors.ink3)),
                  ),
                for (var i = 0; i < exams.length; i++) ...[
                  _ExamRow(exam: exams[i]),
                  if (i < exams.length - 1) const Divider(height: 1, indent: 16, endIndent: 16),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ExamRow extends StatelessWidget {
  const _ExamRow({required this.exam});

  final Map<String, dynamic> exam;

  @override
  Widget build(BuildContext context) {
    final expected = exam['expected'] as int? ?? 0;
    final entered = exam['entered'] as int? ?? 0;
    final isDone = expected > 0 && entered >= expected;
    final examDate = exam['examDate'] as String?;

    return AppListRow(
      icon: Icons.edit_note_outlined,
      tone: isDone ? Tone.good : Tone.warn,
      title: exam['subjectName'] as String,
      subtitle: '${examDate != null ? '${formatDay(examDate)} · ' : ''}'
          'Max ${exam['maxMarks']} · $entered/$expected entered',
      trailing: ToneBadge(isDone ? 'Done' : 'Enter marks', tone: isDone ? Tone.good : Tone.warn),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ExamMarksEntryScreen(examId: exam['id'] as String, subjectName: exam['subjectName'] as String),
        ),
      ),
    );
  }
}
