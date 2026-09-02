import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'exam_term_detail_screen.dart';

final examTermsProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/exams/terms');
});

const _examStatusTabs = [
  (value: '_ALL', label: 'All'),
  (value: 'IN_PROGRESS', label: 'In progress'),
  (value: 'READY', label: 'Ready'),
  (value: 'PUBLISHED', label: 'Published'),
];

String _examTermStatus(Map<String, dynamic> term) {
  final expected = term['expected'] as int? ?? 0;
  final entered = term['entered'] as int? ?? 0;
  final isDone = expected > 0 && entered >= expected;
  if (term['isPublished'] == true) return 'PUBLISHED';
  return isDone ? 'READY' : 'IN_PROGRESS';
}

/// Mirrors src/app/app/exams/page.tsx's cycle list for staff: one row per
/// exam cycle (a name usually spans every class), with how much marks entry
/// is actually finished — the same question a principal or teacher has.
/// Filterable by that status, since a long-running school builds up cycles
/// from every past term.
class ExamTermsScreen extends ConsumerStatefulWidget {
  const ExamTermsScreen({super.key});

  @override
  ConsumerState<ExamTermsScreen> createState() => _ExamTermsScreenState();
}

class _ExamTermsScreenState extends ConsumerState<ExamTermsScreen> {
  String _status = '_ALL';

  @override
  Widget build(BuildContext context) {
    final result = ref.watch(examTermsProvider);

    return Scaffold(
      appBar: AppTopBar(title: 'Exams & marks'),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.xs,
              AppSpacing.page,
              0,
            ),
            child: AppFilterBar(
              labels: [for (final t in _examStatusTabs) t.label],
              selectedIndex: _examStatusTabs.indexWhere(
                (t) => t.value == _status,
              ),
              onSelected: (index) =>
                  setState(() => _status = _examStatusTabs[index].value),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(examTermsProvider),
              child: result.when(
                loading: () => const AppListSkeleton(),
                error: (err, _) => ErrorView(
                  error: err,
                  onRetry: () => ref.invalidate(examTermsProvider),
                ),
                data: (data) {
                  final all = (data['terms'] as List)
                      .cast<Map<String, dynamic>>();
                  final terms = _status == '_ALL'
                      ? all
                      : all
                            .where((t) => _examTermStatus(t) == _status)
                            .toList();
                  if (terms.isEmpty) {
                    return EmptyState(
                      icon: Icons.school_outlined,
                      title: all.isEmpty ? 'No exam cycles' : 'No matches',
                      message: all.isEmpty
                          ? 'Exam cycles appear here once they are created.'
                          : 'Try a different filter.',
                    );
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.page,
                      AppSpacing.md,
                      AppSpacing.page,
                      AppSpacing.xxl,
                    ),
                    itemCount: terms.length,
                    separatorBuilder: (_, _) =>
                        const SizedBox(height: AppSpacing.md),
                    itemBuilder: (context, index) {
                      final term = terms[index];
                      final expected = term['expected'] as int? ?? 0;
                      final entered = term['entered'] as int? ?? 0;
                      final isDone = expected > 0 && entered >= expected;
                      final published = term['isPublished'] == true;
                      final tone = published
                          ? Tone.brand
                          : (isDone ? Tone.good : Tone.warn);
                      final progress = expected > 0
                          ? (entered / expected).clamp(0.0, 1.0)
                          : 0.0;

                      return AppFadeIn(
                        delay: AppFadeIn.stagger(index),
                        child: AppSurface(
                          padding: const EdgeInsets.all(AppSpacing.lg),
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => ExamTermDetailScreen(
                                termName: term['name'] as String,
                              ),
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      term['name'] as String,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 15.5,
                                        letterSpacing: -0.25,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: AppSpacing.sm),
                                  ToneBadge(
                                    published
                                        ? 'Published'
                                        : (isDone ? 'Ready' : 'In progress'),
                                    tone: tone,
                                  ),
                                ],
                              ),
                              const SizedBox(height: 3),
                              Text(
                                '${term['classCount']} classes · ${term['examCount']} exams',
                                style: const TextStyle(
                                  color: AppColors.ink3,
                                  fontSize: 12.5,
                                ),
                              ),
                              // Marks entry is the thing this list is checked for, so
                              // it gets a rule rather than a fragment of a sentence.
                              if (expected > 0) ...[
                                const SizedBox(height: AppSpacing.md),
                                Row(
                                  children: [
                                    Expanded(
                                      child: ClipRRect(
                                        borderRadius: BorderRadius.circular(
                                          AppRadius.pill,
                                        ),
                                        child: TweenAnimationBuilder<double>(
                                          tween: Tween(begin: 0, end: progress),
                                          duration: AppMotion.slow,
                                          curve: AppMotion.curve,
                                          builder: (context, value, _) =>
                                              LinearProgressIndicator(
                                                value: value,
                                                minHeight: 6,
                                                backgroundColor:
                                                    AppColors.paper2,
                                                valueColor:
                                                    AlwaysStoppedAnimation(
                                                      toneColor(tone),
                                                    ),
                                              ),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: AppSpacing.md),
                                    Text(
                                      '$entered/$expected',
                                      style: const TextStyle(
                                        color: AppColors.ink2,
                                        fontSize: 12.5,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
