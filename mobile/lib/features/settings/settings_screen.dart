import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'academic_year_overview_screen.dart';

final _schoolProfileProvider = FutureProvider((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/settings/school');
});

final _classesProvider = FutureProvider((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/settings/classes');
});

final _subjectsProvider = FutureProvider.family<Map<String, dynamic>, String?>((ref, classId) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/settings/subjects', query: classId != null ? {'classId': classId} : null);
});

final _yearsProvider = FutureProvider((ref) async {
  final api = ref.watch(apiClientProvider);
  return api.get<Map<String, dynamic>>('/settings/years');
});

enum _Section { profile, classes, subjects, years }

/// Mirrors the office-only desk work behind src/app/app/settings/**, but
/// read-only: school profile, classes/sections, subjects, and academic years.
/// The web app's setup wizards (create/rename/delete class, generate terms,
/// assign class teachers, …) stay web-only for this pass — mobile is for
/// looking things up at a glance, not running the school year setup.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  _Section _section = _Section.profile;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // The four sections moved from a cramped four-up SegmentedButton (which
      // ellipsed "Subjects" on a small phone) to the same scrolling pill row
      // every filterable list in the app uses.
      appBar: AppTopBar(
        title: 'Settings',
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: AppFilterBar(
              labels: const ['Profile', 'Classes', 'Subjects', 'Years'],
              selectedIndex: _Section.values.indexOf(_section),
              onSelected: (index) => setState(() => _section = _Section.values[index]),
            ),
          ),
        ),
      ),
      body: AnimatedSwitcher(
        duration: AppMotion.base,
        switchInCurve: AppMotion.curve,
        child: KeyedSubtree(
          key: ValueKey(_section),
          child: switch (_section) {
            _Section.profile => const _ProfileSection(),
            _Section.classes => const _ClassesSection(),
            _Section.subjects => const _SubjectsSection(),
            _Section.years => const _YearsSection(),
          },
        ),
      ),
    );
  }
}

class _ProfileSection extends ConsumerWidget {
  const _ProfileSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(_schoolProfileProvider);
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_schoolProfileProvider),
      color: AppColors.brand,
      backgroundColor: AppColors.card,
      child: result.when(
        loading: () => const AppDetailSkeleton(),
        error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_schoolProfileProvider)),
        data: (data) {
          final school = data['school'] as Map<String, dynamic>;
          return ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.sm,
              AppSpacing.page,
              AppSpacing.xxl,
            ),
            children: [
              // The school's own identity leads the screen, with the crest
              // medallion doing the work a row of grey text used to.
              AppSurface(
                padding: const EdgeInsets.all(AppSpacing.ml),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 52,
                      height: 52,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: AppColors.brandLight,
                        borderRadius: BorderRadius.circular(AppRadius.sm),
                      ),
                      child: const Icon(Icons.apartment_outlined, color: AppColors.brand, size: 26),
                    ),
                    const SizedBox(width: AppSpacing.lg),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            school['name'] as String? ?? '',
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '/s/${school['slug'] ?? ''}',
                            style: const TextStyle(color: AppColors.ink3, fontSize: 13),
                          ),
                          if (school['board'] != null || school['status'] != null) ...[
                            const SizedBox(height: AppSpacing.md),
                            Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: [
                                if (school['board'] != null) ToneBadge(school['board'] as String, tone: Tone.brand),
                                if (school['status'] != null) ToneBadge(school['status'] as String, tone: Tone.info),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              _InfoGroup(
                title: 'Contact',
                icon: Icons.call_rounded,
                rows: [
                  ('Phone', school['phone'] as String?),
                  ('Email', school['email'] as String?),
                  ('Website', school['website'] as String?),
                  ('Address', school['address'] as String?),
                  ('City', school['city'] as String?),
                  ('State', school['state'] as String?),
                ],
              ),
              _InfoGroup(
                title: 'Affiliation',
                icon: Icons.verified_outlined,
                rows: [
                  ('Principal', school['principalName'] as String?),
                  ('UDISE code', school['udiseCode'] as String?),
                  ('Affiliation no.', school['affiliationNo'] as String?),
                ],
              ),
              _InfoGroup(
                title: 'Payments',
                icon: Icons.account_balance_outlined,
                rows: [
                  ('UPI ID', school['upiId'] as String?),
                  ('UPI payee', school['upiPayeeName'] as String?),
                  ('Bank', school['bankName'] as String?),
                  ('Account no.', school['bankAccountNo'] as String?),
                  ('IFSC', school['bankIfsc'] as String?),
                ],
              ),
              const SizedBox(height: AppSpacing.ml),
              const AppBanner(
                message: 'Editing the school profile stays a web/desktop task for now.',
                tone: Tone.neutral,
                icon: Icons.info_outline_rounded,
              ),
            ],
          );
        },
      ),
    );
  }
}

/// A titled run of label/value rows, silent when nothing in it is filled in.
class _InfoGroup extends StatelessWidget {
  const _InfoGroup({required this.title, required this.rows, required this.icon});

  final String title;
  final IconData icon;
  final List<(String, String?)> rows;

  @override
  Widget build(BuildContext context) {
    final present = rows.where((r) => r.$2 != null && r.$2!.isNotEmpty).toList();
    if (present.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionHeader(title),
          const SizedBox(height: AppSpacing.md),
          AppKeyValueGroup(
            rows: [
              for (final row in present) AppKeyValue(label: row.$1, value: row.$2!),
            ],
          ),
        ],
      ),
    );
  }
}

class _ClassesSection extends ConsumerWidget {
  const _ClassesSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(_classesProvider);
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_classesProvider),
      color: AppColors.brand,
      backgroundColor: AppColors.card,
      child: result.when(
        loading: () => const AppListSkeleton(hasLeading: true),
        error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_classesProvider)),
        data: (data) {
          final classes = (data['classes'] as List).cast<Map<String, dynamic>>();
          if (classes.isEmpty) {
            return const EmptyState(
              icon: Icons.class_outlined,
              title: 'No classes yet',
              message: 'Classes appear here once the office adds them.',
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.sm,
              AppSpacing.page,
              AppSpacing.xxl,
            ),
            itemCount: classes.length,
            separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
            itemBuilder: (context, index) => AppFadeIn(
              delay: AppFadeIn.stagger(index),
              child: _ClassCard(data: classes[index]),
            ),
          );
        },
      ),
    );
  }
}

/// One class as a self-contained panel that expands its sections in place.
/// Replaces `ExpansionTile`, whose stock chrome (full-width dividers, a bare
/// caret, its own inset rules) fought every other surface on the screen.
class _ClassCard extends StatefulWidget {
  const _ClassCard({required this.data});

  final Map<String, dynamic> data;

  @override
  State<_ClassCard> createState() => _ClassCardState();
}

class _ClassCardState extends State<_ClassCard> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final sections = (widget.data['sections'] as List? ?? []).cast<Map<String, dynamic>>();

    return AppSurface(
      clip: true,
      child: Column(
        children: [
          AppListRow(
            leading: Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: AppColors.brandLight,
                borderRadius: BorderRadius.circular(AppRadius.sm),
              ),
              child: Text(
                '${widget.data['name']}',
                maxLines: 1,
                style: const TextStyle(
                  color: AppColors.brandInk,
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                  height: 1,
                ),
              ),
            ),
            title: widget.data['name'] as String,
            subtitle: '${widget.data['students']} students · ${widget.data['subjects']} subjects · '
                '${sections.length} section${sections.length == 1 ? '' : 's'}',
            // A rotating caret rather than two swapped glyphs, so the
            // open/closed state reads as one control moving.
            trailing: AnimatedRotation(
              turns: _open ? 0.5 : 0,
              duration: AppMotion.base,
              curve: AppMotion.curve,
              child: const Icon(Icons.expand_more_rounded, color: AppColors.ink3, size: 22),
            ),
            onTap: () => setState(() => _open = !_open),
          ),
          AnimatedSize(
            duration: AppMotion.base,
            curve: AppMotion.curve,
            alignment: Alignment.topCenter,
            child: !_open
                ? const SizedBox(width: double.infinity)
                : Column(
                    children: [
                      const Divider(height: 1, indent: AppSpacing.lg, endIndent: AppSpacing.lg),
                      if (sections.isEmpty)
                        const Padding(
                          padding: EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, AppSpacing.lg),
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: Text('No sections yet.', style: TextStyle(color: AppColors.ink3, fontSize: 13)),
                          ),
                        )
                      else
                        Padding(
                          padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, AppSpacing.md),
                          child: Column(
                            children: [
                              for (final s in sections)
                                Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 7),
                                  child: Row(
                                    children: [
                                      Container(
                                        width: 26,
                                        height: 26,
                                        alignment: Alignment.center,
                                        decoration: BoxDecoration(
                                          color: AppColors.paper2,
                                          borderRadius: BorderRadius.circular(AppRadius.xs),
                                        ),
                                        child: Text(
                                          '${s['name']}',
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w700,
                                            fontSize: 12,
                                            color: AppColors.ink2,
                                            height: 1,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: AppSpacing.md),
                                      Expanded(
                                        child: Text(
                                          '${s['students']} students'
                                          '${s['classTeacherName'] != null ? ' · class teacher ${s['classTeacherName']}' : ''}',
                                          style: const TextStyle(fontSize: 13, height: 1.4, color: AppColors.ink2),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _SubjectsSection extends ConsumerStatefulWidget {
  const _SubjectsSection();

  @override
  ConsumerState<_SubjectsSection> createState() => _SubjectsSectionState();
}

class _SubjectsSectionState extends ConsumerState<_SubjectsSection> {
  String? _classId;

  @override
  Widget build(BuildContext context) {
    final result = ref.watch(_subjectsProvider(_classId));
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_subjectsProvider(_classId)),
      color: AppColors.brand,
      backgroundColor: AppColors.card,
      child: result.when(
        loading: () => const AppCardsSkeleton(),
        error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_subjectsProvider(_classId))),
        data: (data) {
          final classes = (data['classes'] as List).cast<Map<String, dynamic>>();
          final subjects = (data['subjects'] as List? ?? []).cast<Map<String, dynamic>>();
          final selectedId = _classId ?? data['selectedClassId'] as String?;

          return ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.sm,
              AppSpacing.page,
              AppSpacing.xxl,
            ),
            children: [
              if (classes.isNotEmpty)
                DropdownButtonFormField<String>(
                  initialValue: selectedId,
                  decoration: const InputDecoration(
                    labelText: 'Class',
                    prefixIcon: Icon(Icons.class_outlined, size: 20),
                  ),
                  items: classes
                      .map((c) => DropdownMenuItem(
                            value: c['id'] as String,
                            child: Text('${c['name']} (${c['subjectCount']})'),
                          ))
                      .toList(),
                  onChanged: (value) => setState(() => _classId = value),
                ),
              const SizedBox(height: AppSpacing.ml),
              if (subjects.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: AppSpacing.xl),
                  child: EmptyState(
                    icon: Icons.menu_book_outlined,
                    title: 'No subjects',
                    message: 'Add subjects to this class to see them here.',
                  ),
                )
              else
                AppSurface(
                  clip: true,
                  child: Column(
                    children: [
                      for (var i = 0; i < subjects.length; i++) ...[
                        _SubjectRow(subject: subjects[i]),
                        if (i < subjects.length - 1)
                          const Divider(height: 1, indent: AppTile.dividerIndent, endIndent: AppSpacing.lg),
                      ],
                    ],
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _SubjectRow extends StatelessWidget {
  const _SubjectRow({required this.subject});

  final Map<String, dynamic> subject;

  @override
  Widget build(BuildContext context) {
    final teacherNames = (subject['teacherNames'] as List? ?? []).cast<String>();
    final elective = subject['isElective'] == true;
    final coScholastic = subject['isCoScholastic'] == true;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppListRow(
          icon: Icons.menu_book_outlined,
          title: subject['name'] as String,
          // The teacher line needs its own warning tint when nothing is
          // assigned, which AppListRow's plain subtitle string can't carry —
          // so the whole two-line block is composed here instead.
          titleWidget: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                subject['name'] as String,
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15, letterSpacing: -0.2),
              ),
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  teacherNames.isEmpty ? 'No teacher assigned' : teacherNames.join(', '),
                  style: TextStyle(
                    color: teacherNames.isEmpty ? AppColors.marigold : AppColors.ink3,
                    fontSize: 12.5,
                    height: 1.35,
                  ),
                ),
              ),
            ],
          ),
        ),
        if (elective || coScholastic)
          Padding(
            padding: const EdgeInsets.fromLTRB(AppTile.dividerIndent, 0, AppSpacing.lg, AppSpacing.sm),
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                if (elective) const ToneBadge('Elective', tone: Tone.info),
                if (coScholastic) const ToneBadge('Co-scholastic', tone: Tone.warn),
              ],
            ),
          ),
      ],
    );
  }
}

class _YearsSection extends ConsumerWidget {
  const _YearsSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(_yearsProvider);
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_yearsProvider),
      color: AppColors.brand,
      backgroundColor: AppColors.card,
      child: result.when(
        loading: () => const AppListSkeleton(),
        error: (err, _) => ErrorView(error: err, onRetry: () => ref.invalidate(_yearsProvider)),
        data: (data) {
          final years = (data['years'] as List).cast<Map<String, dynamic>>();
          if (years.isEmpty) {
            return const EmptyState(
              icon: Icons.calendar_month_outlined,
              title: 'No academic years',
              message: 'Set up an academic year to get started.',
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.sm,
              AppSpacing.page,
              AppSpacing.xxl,
            ),
            itemCount: years.length,
            separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
            itemBuilder: (context, index) {
              final y = years[index];
              final isCurrent = y['isCurrent'] as bool? ?? false;

              return AppFadeIn(
                delay: AppFadeIn.stagger(index),
                child: AppSurface(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  // The running year gets a brand rail down its left edge —
                  // the one thing you scan this list to find.
                  border: isCurrent
                      ? const Border(left: BorderSide(color: AppColors.brand, width: 3))
                      : null,
                  // The whole session, laid out end to end — exam terms, PTM
                  // days, calendar entries — rather than the create/rename/
                  // current-toggle actions, which stay web-only by design
                  // (see the "mobile is for looking things up" note above).
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => AcademicYearOverviewScreen(
                        yearId: y['id'] as String,
                        yearName: y['name'] as String,
                      ),
                    ),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              y['name'] as String,
                              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5, letterSpacing: -0.2),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              '${y['startDate']} → ${y['endDate']}',
                              style: const TextStyle(color: AppColors.ink3, fontSize: 12.5),
                            ),
                            Text(
                              '${y['invoices']} invoices',
                              style: const TextStyle(color: AppColors.ink3, fontSize: 12.5),
                            ),
                          ],
                        ),
                      ),
                      if (isCurrent) const ToneBadge('Current', tone: Tone.good),
                      const SizedBox(width: AppSpacing.sm),
                      const Icon(Icons.chevron_right, size: 18, color: AppColors.ink3),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
