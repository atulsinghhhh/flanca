import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

final _libraryQueryProvider = StateProvider.autoDispose<String>((ref) => '');

final libraryBooksProvider = FutureProvider((ref) async {
  final api = ref.watch(apiClientProvider);
  final q = ref.watch(_libraryQueryProvider);
  final data = await api.get<Map<String, dynamic>>(
    '/library/books',
    query: q.isEmpty ? null : {'q': q},
  );
  return (data['books'] as List).cast<Map<String, dynamic>>();
});

/// Mirrors src/app/app/library/page.tsx's catalogue search: a librarian
/// looking a title up at the desk and handing a copy across, right there.
/// [embedded] drops the Scaffold/AppBar when hosted inside a tab (see
/// LibraryHomeScreen); standalone it is a normal pushed screen.
class LibraryCatalogueScreen extends ConsumerStatefulWidget {
  const LibraryCatalogueScreen({super.key, this.embedded = false});

  final bool embedded;

  @override
  ConsumerState<LibraryCatalogueScreen> createState() =>
      _LibraryCatalogueScreenState();
}

class _LibraryCatalogueScreenState
    extends ConsumerState<LibraryCatalogueScreen> {
  final _searchController = TextEditingController();
  bool _issuing = false;
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      ref.read(_libraryQueryProvider.notifier).state = value.trim();
    });
  }

  Future<void> _issueBook(Map<String, dynamic> book) async {
    final studentId = await showAppFormSheet<String>(
      context,
      builder: (_) => _IssueBookDialog(bookTitle: book['title'] as String),
    );
    if (studentId == null || studentId.isEmpty) return;

    setState(() => _issuing = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.post(
        '/library/issues',
        data: {'bookId': book['id'], 'studentId': studentId},
      );
      ref.invalidate(libraryBooksProvider);
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('"${book['title']}" issued.')));
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _issuing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final books = ref.watch(libraryBooksProvider);

    final body = Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(AppSpacing.ml),
          child: AppSearchField(
            controller: _searchController,
            hintText: 'Title, author, accession no. or ISBN',
            onChanged: _onSearchChanged,
            textInputAction: TextInputAction.search,
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => ref.invalidate(libraryBooksProvider),
            child: books.when(
              loading: () => const AppListSkeleton(rows: 8),
              error: (err, _) => ErrorView(
                error: err,
                onRetry: () => ref.invalidate(libraryBooksProvider),
              ),
              data: (rows) {
                if (rows.isEmpty) {
                  return const EmptyState(
                    icon: Icons.menu_book_outlined,
                    title: 'No books found',
                    message: 'Try a different search or filter.',
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: rows.length,
                  separatorBuilder: (_, _) => const Divider(
                    height: 1,
                    indent: AppSpacing.page,
                    endIndent: AppSpacing.page,
                  ),
                  itemBuilder: (context, index) {
                    final book = rows[index];
                    final available = book['availableCopies'] as int;
                    final total = book['totalCopies'] as int;
                    final canIssue = available > 0 && !_issuing;
                    return AppListRow(
                      title: book['title'] as String,
                      subtitle:
                          '${book['author'] ?? 'Unknown author'} · ${book['accessionNo']}'
                          '${book['shelf'] != null ? ' · Shelf ${book['shelf']}' : ''}',
                      trailing: ToneBadge(
                        '$available/$total',
                        tone: available > 0 ? Tone.good : Tone.bad,
                      ),
                      onTap: canIssue ? () => _issueBook(book) : null,
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
      appBar: AppTopBar(title: 'Library catalogue'),
      body: body,
    );
  }
}

class _IssueBookDialog extends StatefulWidget {
  const _IssueBookDialog({required this.bookTitle});

  final String bookTitle;

  @override
  State<_IssueBookDialog> createState() => _IssueBookDialogState();
}

class _IssueBookDialogState extends State<_IssueBookDialog> {
  final _formKey = GlobalKey<FormState>();
  final _studentIdController = TextEditingController();

  @override
  void dispose() {
    _studentIdController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppFormSheet(
      title: 'Issue book',
      subtitle: widget.bookTitle,
      actions: [
        OutlinedButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        AppSubmitButton(
          label: 'Issue',
          onPressed: () {
            if (_formKey.currentState!.validate()) {
              Navigator.of(context).pop(_studentIdController.text.trim());
            }
          },
        ),
      ],
      child: Form(
        key: _formKey,
        child: TextFormField(
          controller: _studentIdController,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Student ID'),
          validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
        ),
      ),
    );
  }
}
