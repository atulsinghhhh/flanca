import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'homework_detail_screen.dart';
import 'homework_form_screen.dart';

Tone _toneForHomeworkStatus(String status) => switch (status) {
      'DRAFT' => Tone.neutral,
      'ASSIGNED' => Tone.info,
      'CLOSED' => Tone.neutral,
      _ => Tone.neutral,
    };

final homeworkListProvider = FutureProvider((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/homework');
});

const _homeworkStatusTabs = [
  (value: '_ALL', label: 'All'),
  (value: 'DRAFT', label: 'Draft'),
  (value: 'ASSIGNED', label: 'Assigned'),
  (value: 'CLOSED', label: 'Closed'),
];

/// Mirrors src/app/app/homework/page.tsx, scoped to what the mobile /homework
/// GET returns for this actor's role (teacher's own sections, a student's own
/// class/section, a parent's children, or the office's whole-school list).
/// Everything for that scope arrives in one call, so search and the status
/// filter both run client-side.
class HomeworkListScreen extends ConsumerStatefulWidget {
  const HomeworkListScreen({super.key});

  @override
  ConsumerState<HomeworkListScreen> createState() => _HomeworkListScreenState();
}

class _HomeworkListScreenState extends ConsumerState<HomeworkListScreen> {
  final _searchController = TextEditingController();
  String _query = '';
  String _status = '_ALL';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final list = ref.watch(homeworkListProvider);
    final isTeaching = ref.watch(authControllerProvider).actor?.isTeaching ?? false;

    return Scaffold(
      appBar: const AppTopBar(title: 'Homework'),
      floatingActionButton: isTeaching
          ? AppFab(
              tooltip: 'Set homework',
              icon: Icons.add_rounded,
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const HomeworkFormScreen())),
            )
          : null,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.xs, AppSpacing.page, AppSpacing.sm),
            child: AppSearchField(
              controller: _searchController,
              hintText: 'Title or subject',
              onChanged: (value) => setState(() => _query = value),
              textInputAction: TextInputAction.search,
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: AppFilterBar(
              labels: [for (final t in _homeworkStatusTabs) t.label],
              selectedIndex: _homeworkStatusTabs.indexWhere((t) => t.value == _status),
              onSelected: (index) => setState(() => _status = _homeworkStatusTabs[index].value),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(homeworkListProvider),
              color: AppColors.brand,
              backgroundColor: AppColors.card,
              child: list.when(
                loading: () => const AppListSkeleton(hasLeading: true),
                error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(homeworkListProvider)),
                data: (data) {
                  final all = (data['homework'] as List).cast<Map<String, dynamic>>();
                  final q = _query.trim().toLowerCase();
                  final items = all.where((hw) {
                    if (_status != '_ALL' && hw['status'] != _status) return false;
                    if (q.isEmpty) return true;
                    final title = (hw['title'] as String? ?? '').toLowerCase();
                    final subject = ((hw['subject'] as Map?)?['name'] as String? ?? '').toLowerCase();
                    return title.contains(q) || subject.contains(q);
                  }).toList();

                  if (items.isEmpty) {
                    return EmptyState(
                      icon: Icons.menu_book_outlined,
                      title: all.isEmpty ? 'No homework' : 'No matches',
                      message: all.isEmpty
                          ? 'Assignments appear here once they are set.'
                          : 'Try a different search or filter.',
                    );
                  }
                  return ListView.separated(
                    padding: EdgeInsets.fromLTRB(
                      AppSpacing.page,
                      AppSpacing.md,
                      AppSpacing.page,
                      isTeaching ? AppSpacing.bottomSafe : AppSpacing.xxl,
                    ),
                    itemCount: items.length,
                    separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
                    itemBuilder: (context, index) {
                      final hw = items[index];
                      final due = hw['dueOn'] as String?;
                      final status = hw['status'] as String? ?? '';
                      final mySubmission = hw['mySubmission'] as Map<String, dynamic>?;
                      final hasMySubmission = hw.containsKey('mySubmission');

                      final meta = [
                        hw['subject']?['name'],
                        '${hw['class']?['name'] ?? ''} ${hw['section']?['name'] ?? ''}'.trim(),
                      ].whereType<String>().where((s) => s.isNotEmpty).join(' · ');

                      return AppFadeIn(
                        delay: AppFadeIn.stagger(index),
                        child: _HomeworkCard(
                          title: hw['title'] as String,
                          meta: meta,
                          due: due,
                          badge: hasMySubmission
                              ? ToneBadge(
                                  mySubmission != null ? 'Submitted' : 'Pending',
                                  tone: mySubmission != null ? Tone.good : Tone.warn,
                                )
                              : ToneBadge(status, tone: _toneForHomeworkStatus(status)),
                          onTap: () async {
                            await Navigator.of(context).push(
                              MaterialPageRoute(builder: (_) => HomeworkDetailScreen(homeworkId: hw['id'] as String)),
                            );
                            ref.invalidate(homeworkListProvider);
                          },
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

/// One assignment. The due date was buried mid-way through a run-on subtitle;
/// it now sits on its own line with a clock glyph, because "when is this due"
/// is the only question this list gets asked.
class _HomeworkCard extends StatelessWidget {
  const _HomeworkCard({
    required this.title,
    required this.meta,
    required this.due,
    required this.badge,
    required this.onTap,
  });

  final String title;
  final String meta;
  final String? due;
  final Widget badge;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AppSurface(
      onTap: onTap,
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.infoLight,
              borderRadius: BorderRadius.circular(AppRadius.sm),
            ),
            child: const Icon(Icons.menu_book_outlined, size: 20, color: AppColors.info),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15, height: 1.3, letterSpacing: -0.25),
                ),
                if (meta.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text(
                      meta,
                      style: const TextStyle(color: AppColors.ink3, fontSize: 12.5, height: 1.35),
                    ),
                  ),
                if (due != null)
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.sm),
                    child: Row(
                      children: [
                        const Icon(Icons.schedule_outlined, size: 13, color: AppColors.ink3),
                        const SizedBox(width: 5),
                        Text(
                          'Due ${due!.substring(0, 10)}',
                          style: const TextStyle(
                            color: AppColors.ink2,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          badge,
        ],
      ),
    );
  }
}
