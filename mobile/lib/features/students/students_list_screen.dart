import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'student_detail_screen.dart';
import 'student_form_screen.dart';
import 'student_logins_screen.dart';

/// The class/section picker every student screen in this feature needs —
/// fetched once here rather than duplicated per screen. Reuses
/// src/app/api/mobile/v1/settings/classes, the same endpoint the web
/// settings page already built; there is no separate students/classes route.
final classOptionsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.get<Map<String, dynamic>>('/settings/classes');
  return (data['classes'] as List).cast<Map<String, dynamic>>();
});

const statusTabs = [
  (value: 'ACTIVE', label: 'On roll'),
  (value: 'ALUMNI', label: 'Alumni'),
  (value: 'TRANSFERRED', label: 'Transferred'),
  (value: 'DROPPED', label: 'Left'),
];

/// One page of the roster, keyed so a change to any filter or the page
/// number gets its own cached request (and an old page's data never bleeds
/// into a new filter while the new one is loading).
class StudentsQuery {
  const StudentsQuery({this.q = '', this.classId, this.status = 'ACTIVE', this.page = 1});

  final String q;
  final String? classId;
  final String status;
  final int page;

  StudentsQuery copyWith({String? q, String? classId, bool clearClass = false, String? status, int? page}) {
    return StudentsQuery(
      q: q ?? this.q,
      classId: clearClass ? null : (classId ?? this.classId),
      status: status ?? this.status,
      page: page ?? this.page,
    );
  }

  Map<String, dynamic> toQuery() => {
        if (q.isNotEmpty) 'q': q,
        if (classId != null) 'classId': classId,
        'status': status,
        'page': '$page',
      };

  @override
  bool operator ==(Object other) =>
      other is StudentsQuery && other.q == q && other.classId == classId && other.status == status && other.page == page;

  @override
  int get hashCode => Object.hash(q, classId, status, page);
}

final studentsListProvider = FutureProvider.family<Map<String, dynamic>, StudentsQuery>(
  (ref, query) async {
    final api = ref.watch(apiClientProvider);
    return api.get<Map<String, dynamic>>('/students', query: query.toQuery());
  },
);

/// Mirrors src/app/app/students/page.tsx: the office's paginated directory,
/// searchable by name/admission no/parent mobile, filterable by class and
/// roll status. Add-student and issue-logins live off the app bar.
class StudentsListScreen extends ConsumerStatefulWidget {
  const StudentsListScreen({super.key});

  @override
  ConsumerState<StudentsListScreen> createState() => _StudentsListScreenState();
}

class _StudentsListScreenState extends ConsumerState<StudentsListScreen> {
  StudentsQuery _query = const StudentsQuery();
  final _searchController = TextEditingController();
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
      setState(() => _query = _query.copyWith(q: value, page: 1));
    });
  }

  @override
  Widget build(BuildContext context) {
    final result = ref.watch(studentsListProvider(_query));
    final classes = ref.watch(classOptionsProvider);

    return Scaffold(
      appBar: AppTopBar(
        title: 'Students',
        actions: [
          AppIconButton(
            icon: Icons.key_rounded,
            tooltip: 'Student logins',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const StudentLoginsScreen()),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          AppIconButton(
            icon: Icons.person_add_alt_1_outlined,
            tooltip: 'Add student',
            tone: Tone.brand,
            onPressed: () async {
              final created = await Navigator.of(context).push<bool>(
                MaterialPageRoute(builder: (_) => const StudentFormScreen()),
              );
              if (created == true) ref.invalidate(studentsListProvider(_query));
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // Search, roll-status pills and the class picker are one connected
          // filter header now, on the paper ground above the list, rather than
          // three separately-padded controls in three different idioms.
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.xs,
              AppSpacing.page,
              AppSpacing.md,
            ),
            child: AppSearchField(
              controller: _searchController,
              hintText: 'Name, admission no, mobile',
              onChanged: _onSearchChanged,
              textInputAction: TextInputAction.search,
            ),
          ),
          AppFilterBar(
            labels: [for (final tab in statusTabs) tab.label],
            selectedIndex: statusTabs.indexWhere((t) => t.value == _query.status),
            onSelected: (index) => setState(
              () => _query = _query.copyWith(status: statusTabs[index].value, page: 1),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
            child: classes.when(
              loading: () => const SizedBox.shrink(),
              error: (_, _) => const SizedBox.shrink(),
              data: (options) => DropdownButtonFormField<String?>(
                initialValue: _query.classId,
                isDense: true,
                decoration: const InputDecoration(
                  labelText: 'Class',
                  isDense: true,
                  prefixIcon: Icon(Icons.class_outlined, size: 20),
                ),
                items: [
                  const DropdownMenuItem(value: null, child: Text('All classes')),
                  for (final c in options) DropdownMenuItem(value: c['id'] as String, child: Text(c['name'] as String)),
                ],
                onChanged: (value) => setState(
                  () => _query = _query.copyWith(classId: value, clearClass: value == null, page: 1),
                ),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(studentsListProvider(_query)),
              color: AppColors.brand,
              backgroundColor: AppColors.card,
              child: result.when(
                loading: () => const AppListSkeleton(rows: 8, hasLeading: true),
                error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(studentsListProvider(_query))),
                data: (data) {
                  final rows = (data['rows'] as List).cast<Map<String, dynamic>>();
                  final total = data['total'] as int? ?? 0;
                  final page = data['page'] as int? ?? 1;
                  final pageCount = data['pageCount'] as int? ?? 1;

                  if (rows.isEmpty) {
                    return const EmptyState(
                      icon: Icons.person_search_outlined,
                      title: 'No matches',
                      message: 'Try a different search or filter.',
                    );
                  }

                  return Column(
                    children: [
                      Expanded(
                        child: ListView.separated(
                          padding: const EdgeInsets.fromLTRB(0, 8, 0, AppSpacing.lg),
                          itemCount: rows.length,
                          separatorBuilder: (_, _) => const Divider(
                            height: 1,
                            indent: AppSpacing.page,
                            endIndent: AppSpacing.page,
                          ),
                          itemBuilder: (context, index) {
                            final row = rows[index];
                            final className = (row['class'] as Map?)?['name'] as String? ?? '—';
                            final sectionName = (row['section'] as Map?)?['name'] as String?;
                            final outstanding = row['outstanding'] as int? ?? 0;
                            final overdue = row['overdue'] as bool? ?? false;
                            final name = row['name'] as String;

                            return AppListRow(
                              // Initials make a long roll scannable by eye; the
                              // rows are otherwise three near-identical lines of
                              // small grey text.
                              leading: AppAvatar(name: name, size: 40, tone: Tone.neutral),
                              title: name,
                              subtitle: '${row['admissionNumber']} · $className${sectionName != null ? ' $sectionName' : ''}'
                                  '${row['rollNumber'] != null ? ' · Roll ${row['rollNumber']}' : ''}',
                              trailing: outstanding > 0
                                  ? ToneBadge(
                                      formatMoney(outstanding),
                                      tone: overdue ? Tone.bad : Tone.warn,
                                      dot: false,
                                    )
                                  : null,
                              showChevron: true,
                              onTap: () => Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => StudentDetailScreen(studentId: row['id'] as String),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                      if (pageCount > 1)
                        _Pager(
                          total: total,
                          page: page,
                          pageCount: pageCount,
                          onPrevious: page > 1
                              ? () => setState(() => _query = _query.copyWith(page: page - 1))
                              : null,
                          onNext: page < pageCount
                              ? () => setState(() => _query = _query.copyWith(page: page + 1))
                              : null,
                        ),
                    ],
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

/// The paging bar under the roster. A floating pill rather than a full-width
/// chrome band welded to the bottom edge — it belongs to the list, not to the
/// window.
class _Pager extends StatelessWidget {
  const _Pager({
    required this.total,
    required this.page,
    required this.pageCount,
    required this.onPrevious,
    required this.onNext,
  });

  final int total;
  final int page;
  final int pageCount;
  final VoidCallback? onPrevious;
  final VoidCallback? onNext;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(AppSpacing.page, 0, AppSpacing.page, AppSpacing.md),
        child: AppSurface(
          padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.sm, AppSpacing.sm, AppSpacing.sm),
          shadows: AppShadows.raised,
          radius: AppRadius.pill,
          child: Row(
            children: [
              Expanded(
                child: Text(
                  '$total student${total == 1 ? '' : 's'} · page $page of $pageCount',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.ink3, fontSize: 12.5, fontWeight: FontWeight.w600),
                ),
              ),
              AppIconButton(
                icon: Icons.chevron_left_rounded,
                tooltip: 'Previous page',
                size: 38,
                onPressed: onPrevious,
              ),
              const SizedBox(width: 6),
              AppIconButton(
                icon: Icons.chevron_right_rounded,
                tooltip: 'Next page',
                size: 38,
                onPressed: onNext,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

