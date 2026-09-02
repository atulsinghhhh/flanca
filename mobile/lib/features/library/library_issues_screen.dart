import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

final libraryIssuesProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get<Map<String, dynamic>>('/library/issues');
  return (data['issues'] as List).cast<Map<String, dynamic>>();
});

/// Mirrors src/app/app/library/page.tsx's "Books out" table: every open
/// loan, overdue ones flagged, with the desk actions that close a loan out —
/// return, and (when the return leaves a fine on the books) collect it.
///
/// Note on "collect fine": GET /library/issues only lists loans still open
/// (returnedOn null), and fineAmount is computed only at return time — so an
/// open loan's fineAmount is always 0 even when overdue (projectedFine is
/// the live estimate shown here instead). A fine only becomes real, and
/// collectible, the moment a book is returned late — at which point the loan
/// drops off this list. So "collect fine" is offered right in the returned-
/// book dialog below, rather than as a row action here.
class LibraryIssuesScreen extends ConsumerStatefulWidget {
  const LibraryIssuesScreen({super.key, this.embedded = false});

  final bool embedded;

  @override
  ConsumerState<LibraryIssuesScreen> createState() =>
      _LibraryIssuesScreenState();
}

class _LibraryIssuesScreenState extends ConsumerState<LibraryIssuesScreen> {
  final Set<String> _busy = {};
  final _searchController = TextEditingController();
  String _query = '';
  bool _overdueOnly = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _returnBook(Map<String, dynamic> issue) async {
    final issueId = issue['id'] as String;
    final bookTitle =
        (issue['book'] as Map<String, dynamic>)['title'] as String;

    setState(() => _busy.add(issueId));
    try {
      final api = ref.read(apiClientProvider);
      final result = await api.post<Map<String, dynamic>>(
        '/library/issues/$issueId/return',
      );
      final fine = result['fine'] as int;
      ref.invalidate(libraryIssuesProvider);
      if (!mounted) return;

      if (fine > 0) {
        final collectNow = await showDialog<bool>(
          context: context,
          builder: (_) => AlertDialog(
            title: const Text('Book returned'),
            content: Text(
              '"$bookTitle" is back. A fine of ${formatMoney(fine)} is due.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('Later'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('Collect now'),
              ),
            ],
          ),
        );
        if (collectNow == true) await _collectFine(issueId);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('"$bookTitle" returned on time.')),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _busy.remove(issueId));
    }
  }

  Future<void> _collectFine(String issueId) async {
    try {
      final api = ref.read(apiClientProvider);
      await api.post('/library/issues/$issueId/fine');
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Fine collected.')));
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final issues = ref.watch(libraryIssuesProvider);

    final body = Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.ml,
            AppSpacing.xs,
            AppSpacing.ml,
            AppSpacing.sm,
          ),
          child: AppSearchField(
            controller: _searchController,
            hintText: 'Student, book title or accession no.',
            onChanged: (value) => setState(() => _query = value),
            textInputAction: TextInputAction.search,
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: AppFilterBar(
            labels: const ['All', 'Overdue'],
            selectedIndex: _overdueOnly ? 1 : 0,
            onSelected: (index) => setState(() => _overdueOnly = index == 1),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => ref.invalidate(libraryIssuesProvider),
            child: issues.when(
              loading: () => const AppListSkeleton(),
              error: (err, _) => ErrorView(
                error: err,
                onRetry: () => ref.invalidate(libraryIssuesProvider),
              ),
              data: (all) {
                final q = _query.trim().toLowerCase();
                final rows = all.where((issue) {
                  if (_overdueOnly && issue['isOverdue'] != true) return false;
                  if (q.isEmpty) return true;
                  final book = issue['book'] as Map<String, dynamic>;
                  final student = issue['student'] as Map<String, dynamic>;
                  final haystack =
                      '${student['name']} ${book['title']} ${book['accessionNo']}'
                          .toLowerCase();
                  return haystack.contains(q);
                }).toList();

                if (rows.isEmpty) {
                  return EmptyState(
                    icon: Icons.assignment_turned_in_outlined,
                    title: all.isEmpty ? 'Nothing on loan' : 'No matches',
                    message: all.isEmpty
                        ? 'Books currently issued will be listed here.'
                        : 'Try a different search or filter.',
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.all(AppSpacing.ml),
                  itemCount: rows.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    final issue = rows[index];
                    final issueId = issue['id'] as String;
                    final book = issue['book'] as Map<String, dynamic>;
                    final student = issue['student'] as Map<String, dynamic>;
                    final isOverdue = issue['isOverdue'] as bool;
                    final projectedFine = issue['projectedFine'] as int;
                    final busy = _busy.contains(issueId);
                    final classObj = student['class'] as Map<String, dynamic>?;
                    final sectionObj =
                        student['section'] as Map<String, dynamic>?;
                    final classLabel = [
                      classObj?['name'],
                      sectionObj?['name'],
                    ].where((v) => v != null).join('-');

                    return AppSurface(
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    book['title'] as String,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                ToneBadge(
                                  isOverdue ? 'Overdue' : 'On loan',
                                  tone: isOverdue ? Tone.bad : Tone.info,
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${student['name']}${classLabel.isNotEmpty ? ' · $classLabel' : ''} · ${book['accessionNo']}',
                              style: const TextStyle(
                                color: AppColors.ink3,
                                fontSize: 12.5,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Due ${formatDay(issue['dueOn'] as String)}'
                              '${isOverdue && projectedFine > 0 ? ' · Est. fine ${formatMoney(projectedFine)}' : ''}',
                              style: TextStyle(
                                color: isOverdue
                                    ? AppColors.overdue
                                    : AppColors.ink3,
                                fontSize: 12.5,
                                fontWeight: isOverdue
                                    ? FontWeight.w600
                                    : FontWeight.normal,
                              ),
                            ),
                            const SizedBox(height: 10),
                            Align(
                              alignment: Alignment.centerRight,
                              child: AppSubmitButton(
                                label: 'Return',
                                busy: busy,
                                onPressed: () => _returnBook(issue),
                              ),
                            ),
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
    );

    if (widget.embedded) return body;
    return Scaffold(
      appBar: AppTopBar(title: 'Library issues'),
      body: body,
    );
  }
}
